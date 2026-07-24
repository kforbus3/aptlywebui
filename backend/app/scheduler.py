"""Background scheduler for automatic mirror updates and re-publishing.

Each enabled Schedule row becomes an APScheduler cron job. When it fires it
updates the mirror's packages and, if a publish target is configured, creates a
fresh snapshot and switches the published distribution to it.
"""

from __future__ import annotations

from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app import audit
from app.aptly import TASK_FAILED, AptlyClient, AptlyError, _clean_prefix
from app.db import SessionLocal
from app.models import Schedule

scheduler = AsyncIOScheduler(timezone="UTC")


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


async def run_schedule(schedule_id: int) -> None:
    """Execute a single schedule: update mirror, optionally re-publish."""
    async with SessionLocal() as db:
        sched = await db.get(Schedule, schedule_id)
        if not sched or not sched.enabled:
            return
        aptly = AptlyClient()
        status, detail = "success", ""
        try:
            # Trigger the async mirror update and wait for the aptly task to
            # finish before snapshotting — the snapshot must see the completed
            # download.
            task = await aptly.update_mirror_packages(sched.mirror)
            task_id = task.get("ID")
            final = await aptly.wait_for_task(task_id)
            if final.get("State") == TASK_FAILED:
                output = await aptly.get_task_output(task_id)
                raise AptlyError(f"mirror update failed: {output.strip()[:200]}")
            await aptly.delete_task(task_id)
            if sched.publish_prefix and sched.publish_distribution:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
                snap_name = f"{sched.mirror}-{stamp}"
                await aptly.create_snapshot_from_mirror(sched.mirror, {"Name": snap_name})
                # Switch every component the target publishes, not just "main",
                # so non-main / multi-component publications republish correctly.
                components = await _publish_components(
                    aptly, sched.publish_prefix, sched.publish_distribution
                )
                ptask = await aptly.update_publish(
                    sched.publish_prefix,
                    sched.publish_distribution,
                    {"Snapshots": [{"Component": c, "Name": snap_name} for c in components]},
                    async_=True,
                )
                pid = ptask.get("ID")
                pfinal = await aptly.wait_for_task(pid)
                if pfinal.get("State") == TASK_FAILED:
                    output = await aptly.get_task_output(pid)
                    raise AptlyError(f"republish failed: {output.strip()[:200]}")
                await aptly.delete_task(pid)
                detail = f"updated mirror and republished {sched.publish_prefix}/{sched.publish_distribution}"
            else:
                detail = "updated mirror packages"
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
                           resource=sched.mirror, status=status, detail=detail)


def add_or_update_job(sched: Schedule) -> None:
    """(Re)register a job for a schedule, or remove it if disabled."""
    job_id = _job_id(sched.id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if not sched.enabled:
        return
    try:
        trigger = CronTrigger.from_crontab(sched.cron, timezone="UTC")
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


def start() -> None:
    if not scheduler.running:
        scheduler.start()


def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
