"""Background scheduler for automatic mirror updates and re-publishing.

Each enabled Schedule row becomes an APScheduler cron job. When it fires it
updates the mirror's packages and, if a publish target is configured, creates a
fresh snapshot and switches the published distribution to it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app import audit
from app.aptly import TASK_FAILED, AptlyClient, AptlyError, _clean_prefix
from app.db import SessionLocal
from app.models import Schedule

logger = logging.getLogger("aptly-webui.scheduler")

scheduler = AsyncIOScheduler(timezone="UTC")

# Active timezone for cron interpretation and dated snapshot names. Set from the
# stored setting at startup (configure_from_settings) and whenever an admin
# changes it (apply_timezone). Both cron firing and the "%Y%m%d-%H%M%S" stamp in
# snapshot names use this, so the name matches what the UI shows in local time.
_app_tz = ZoneInfo("UTC")


def _stamp() -> str:
    """Timestamp for dated snapshot names, in the configured timezone."""
    return datetime.now(_app_tz).strftime("%Y%m%d-%H%M%S")

# Strong refs to in-flight "run now" tasks so the loop doesn't GC them mid-run.
_background_runs: set[asyncio.Task] = set()


def run_in_background(schedule_id: int) -> None:
    """Fire a schedule run on the event loop and return immediately. A full-fleet
    sync takes minutes, so "run now" must not block the HTTP request."""
    task = asyncio.create_task(run_schedule(schedule_id))
    _background_runs.add(task)
    task.add_done_callback(_background_runs.discard)

# aptly sets a mirror-derived snapshot's Description to
# "Snapshot from mirror [<name>]: ..." — the only reliable link back to the mirror.
_MIRROR_RE = re.compile(r"from mirror \[([^\]]+)\]")


def _mirror_of_snapshot(snap: dict | None) -> str | None:
    if not snap:
        return None
    m = _MIRROR_RE.search(snap.get("Description", ""))
    return m.group(1) if m else None


def _job_id(schedule_id: int) -> str:
    return f"schedule-{schedule_id}"


async def _publish_components(aptly: AptlyClient, prefix: str, distribution: str) -> list[str]:
    """Return the component names of an existing publication, defaulting to
    ["main"] if it can't be resolved."""
    want_prefix = _clean_prefix(prefix)
    try:
        for pub in await aptly.list_publish():
            if pub.get("Distribution") != distribution:
                continue
            if _clean_prefix(pub.get("Prefix", "")) != want_prefix:
                continue
            comps = [s.get("Component", "main") for s in (pub.get("Sources") or [])]
            return comps or ["main"]
    except AptlyError:
        pass
    return ["main"]


async def _sync_mirror(aptly: AptlyClient, mirror: str) -> None:
    """Update a mirror's packages and wait for the aptly task to finish."""
    task = await aptly.update_mirror_packages(mirror)
    task_id = task.get("ID")
    final = await aptly.wait_for_task(task_id)
    if final.get("State") == TASK_FAILED:
        output = await aptly.get_task_output(task_id)
        raise AptlyError((output or "").strip()[:200] or "mirror update failed")
    await aptly.delete_task(task_id)


async def _run_mirror_sync(aptly: AptlyClient, sched: Schedule) -> str:
    """Legacy kind: sync one mirror, optionally snapshot + republish one target."""
    await _sync_mirror(aptly, sched.mirror)
    if not (sched.publish_prefix and sched.publish_distribution):
        return "updated mirror packages"
    snap_name = f"{sched.mirror}-{_stamp()}"
    await aptly.create_snapshot_from_mirror(sched.mirror, {"Name": snap_name})
    components = await _publish_components(aptly, sched.publish_prefix, sched.publish_distribution)
    ptask = await aptly.update_publish(
        sched.publish_prefix, sched.publish_distribution,
        {"Snapshots": [{"Component": c, "Name": snap_name} for c in components]}, async_=True,
    )
    pfinal = await aptly.wait_for_task(ptask.get("ID"))
    if pfinal.get("State") == TASK_FAILED:
        output = await aptly.get_task_output(ptask.get("ID"))
        raise AptlyError(f"republish failed: {(output or '').strip()[:200]}")
    await aptly.delete_task(ptask.get("ID"))
    if sched.retention and sched.retention > 0:
        await _prune_snapshots(aptly, {sched.mirror}, sched.retention)
    return f"updated mirror and republished {sched.publish_prefix}/{sched.publish_distribution}"


async def _run_publish_refresh(aptly: AptlyClient, sched: Schedule) -> str:
    """Fleet kind: for the target publications (empty = all), sync the mirrors
    behind each component, snapshot them dated, and switch each component to its
    new snapshot. Component→mirror is resolved from each snapshot's source."""
    raw = (sched.targets or "").strip()
    targets = json.loads(raw) if raw else []
    want = {(_clean_prefix(t.get("prefix", "")), t.get("distribution", "")) for t in targets}
    pubs = await aptly.list_publish()
    if want:
        pubs = [p for p in pubs if (_clean_prefix(p.get("Prefix", "")), p.get("Distribution", "")) in want]
    if not pubs:
        return "no matching publications"

    # Resolve each component's source mirror; collect the unique set to sync.
    comp_mirror: dict[tuple[int, str], str] = {}
    mirrors: set[str] = set()
    for i, p in enumerate(pubs):
        for s in p.get("Sources") or []:
            comp, snap = s.get("Component"), s.get("Name")
            mir = _mirror_of_snapshot(await aptly.get_snapshot(snap) if snap else None)
            if mir:
                comp_mirror[(i, comp)] = mir
                mirrors.add(mir)
    if not mirrors:
        return "no mirror-backed components to refresh"

    # Sync + dated-snapshot each mirror once.
    stamp = _stamp()
    new_snap: dict[str, str] = {}
    failures: list[str] = []
    for m in sorted(mirrors):
        try:
            await _sync_mirror(aptly, m)
            sname = f"{m}-{stamp}"
            await aptly.create_snapshot_from_mirror(m, {"Name": sname})
            new_snap[m] = sname
        except AptlyError as exc:
            failures.append(f"{m}: {exc}")

    # Switch each publication's components to their new snapshots (a component
    # whose mirror failed keeps its current snapshot).
    republished = 0
    for i, p in enumerate(pubs):
        sources = p.get("Sources") or []
        snapshots = [
            {"Component": s.get("Component"),
             "Name": new_snap.get(comp_mirror.get((i, s.get("Component"))), s.get("Name"))}
            for s in sources
        ]
        if not any(sn["Name"] != s.get("Name") for sn, s in zip(snapshots, sources)):
            continue  # nothing changed for this publication
        dist = p.get("Distribution")
        try:
            ptask = await aptly.update_publish(p.get("Prefix", ""), dist, {"Snapshots": snapshots}, async_=True)
            pfinal = await aptly.wait_for_task(ptask.get("ID"))
            if pfinal.get("State") == TASK_FAILED:
                output = await aptly.get_task_output(ptask.get("ID"))
                failures.append(f"publish {dist}: {(output or '').strip()[:120]}")
            else:
                await aptly.delete_task(ptask.get("ID"))
                republished += 1
        except AptlyError as exc:
            failures.append(f"publish {dist}: {exc}")

    pruned = 0
    if sched.retention and sched.retention > 0 and new_snap:
        pruned = await _prune_snapshots(aptly, set(new_snap), sched.retention)

    parts = [f"synced {len(new_snap)}/{len(mirrors)} mirrors", f"republished {republished}"]
    if pruned:
        parts.append(f"pruned {pruned} snapshot(s)")
    summary = ", ".join(parts)
    if failures:
        raise AptlyError(f"{summary}; errors: " + "; ".join(failures[:5]))
    return summary


async def _prune_snapshots(aptly: AptlyClient, mirrors: set[str], keep: int) -> int:
    """Delete this-mirror snapshots beyond the newest `keep`. Published snapshots
    are protected by aptly (delete refused) and simply skipped."""
    try:
        snaps = await aptly.list_snapshots()
    except AptlyError:
        return 0
    pruned = 0
    for m in mirrors:
        mine = [s for s in snaps if _mirror_of_snapshot(s) == m]
        mine.sort(key=lambda s: s.get("CreatedAt", ""), reverse=True)
        for s in mine[keep:]:
            try:
                await aptly.delete_snapshot(s["Name"])
                pruned += 1
            except AptlyError:
                pass  # published or has dependents — leave it
    return pruned


async def run_schedule(schedule_id: int) -> None:
    """Execute a schedule by kind: mirror sync (legacy) or publication refresh."""
    async with SessionLocal() as db:
        sched = await db.get(Schedule, schedule_id)
        if not sched or not sched.enabled:
            return
        aptly = AptlyClient()
        status, detail = "success", ""
        try:
            if sched.kind == "publish":
                detail = await _run_publish_refresh(aptly, sched)
            else:
                detail = await _run_mirror_sync(aptly, sched)
        except AptlyError as exc:
            status, detail = "failure", str(exc)
        except Exception as exc:  # noqa: BLE001
            status, detail = "failure", str(exc)
        finally:
            await aptly.close()

        sched.last_run = datetime.now(timezone.utc)
        sched.last_status = (status + ": " + detail)[:255]
        await db.commit()
        await audit.record(db, username="scheduler", action="scheduled_sync",
                           resource=(sched.mirror or sched.name), status=status, detail=detail)


def add_or_update_job(sched: Schedule) -> None:
    """(Re)register a job for a schedule, or remove it if disabled."""
    job_id = _job_id(sched.id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if not sched.enabled:
        return
    try:
        trigger = CronTrigger.from_crontab(sched.cron, timezone=_app_tz)
    except ValueError:
        return  # invalid cron — validated at the API layer, ignore here
    scheduler.add_job(run_schedule, trigger=trigger, args=[sched.id], id=job_id, replace_existing=True)


def remove_job(schedule_id: int) -> None:
    job_id = _job_id(schedule_id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


async def load_jobs() -> None:
    """Register jobs for all enabled schedules at startup."""
    async with SessionLocal() as db:
        result = await db.execute(select(Schedule).where(Schedule.enabled == True))  # noqa: E712
        for sched in result.scalars().all():
            add_or_update_job(sched)


async def configure_from_settings() -> None:
    """Load the stored timezone into the scheduler at startup (call before
    load_jobs so jobs register with the right cron timezone)."""
    from app.settings_store import get_timezone

    global _app_tz
    async with SessionLocal() as db:
        name = await get_timezone(db)
    try:
        _app_tz = ZoneInfo(name)
        scheduler.timezone = _app_tz
    except Exception:  # noqa: BLE001
        logger.warning("Invalid stored timezone %r; keeping UTC", name)


async def apply_timezone(name: str) -> None:
    """Switch the active timezone and re-register every job so existing cron
    triggers fire in the new zone. Called when an admin changes the setting."""
    global _app_tz
    _app_tz = ZoneInfo(name)  # caller validates; ZoneInfo raises on a bad name
    scheduler.timezone = _app_tz
    await load_jobs()
    logger.info("Scheduler timezone set to %s", name)


def start() -> None:
    if not scheduler.running:
        scheduler.start()


def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
