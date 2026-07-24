import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2, Play, Pencil } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Select, Modal, Table, Badge, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface Schedule {
  id: number;
  name: string;
  kind?: string; // "mirror" | "publish"
  mirror: string;
  targets?: string; // JSON list of {prefix,distribution} for kind "publish" ([] = all)
  retention?: number;
  cron: string;
  enabled: boolean;
  publish_prefix?: string;
  publish_distribution?: string;
  last_run?: string;
  last_status?: string;
}

function scheduleTarget(s: Schedule): string {
  if (s.kind === "publish") {
    let list: unknown[] = [];
    try { list = JSON.parse(s.targets || "[]"); } catch { list = []; }
    return list.length ? `${list.length} publication(s)` : "all publications";
  }
  return s.mirror;
}

export default function Schedules() {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole("operator");
  const [showCreate, setShowCreate] = useState(false);
  const [edit, setEdit] = useState<Schedule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: async () => (await api.get<Schedule[]>("/schedules")).data,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/schedules/${id}`),
    onSuccess: () => {
      toast.success("Schedule deleted");
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const run = useMutation({
    mutationFn: (id: number) => api.post(`/schedules/${id}/run`, {}),
    onSuccess: (res) => {
      toast.success(`Run complete: ${(res.data as any)?.last_status || "ok"}`);
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Schedules"
        subtitle="Automated mirror syncs and publishes"
        actions={
          canEdit && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New Schedule
            </Button>
          )
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<CalendarClock size={32} />} title="No schedules yet" hint="Create a schedule to automate mirror syncs." />
        ) : (
          <Table head={["Name", "Type", "Target", "Cron", "Enabled", "Last Status", ""]}>
            {data.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-slate-200">{s.name}</td>
                <td className="px-4 py-3"><Badge color={s.kind === "publish" ? "purple" : "blue"}>{s.kind === "publish" ? "publications" : "mirror"}</Badge></td>
                <td className="px-4 py-3 text-slate-400">{scheduleTarget(s)}</td>
                <td className="px-4 py-3 font-mono text-slate-400">{s.cron}</td>
                <td className="px-4 py-3"><Badge color={s.enabled ? "green" : "slate"}>{s.enabled ? "enabled" : "disabled"}</Badge></td>
                <td className="px-4 py-3 text-slate-400">{s.last_status || "—"}</td>
                <td className="px-4 py-3">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" loading={run.isPending && run.variables === s.id}
                        onClick={() => run.mutate(s.id)}>
                        <Play size={13} /> Run now
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>
                        <Pencil size={14} className="text-slate-400" />
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => { if (confirm(`Delete schedule "${s.name}"?`)) remove.mutate(s.id); }}>
                        <Trash2 size={14} className="text-red-400" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {showCreate && <ScheduleForm onClose={() => setShowCreate(false)} />}
      {edit && <ScheduleForm schedule={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 03:00", value: "0 3 * * *" },
  { label: "Weekly (Sun 03:00)", value: "0 3 * * 0" },
  { label: "Monthly (1st, 03:00)", value: "0 3 1 * *" },
];

// aptly reports the root prefix as "." or ""; the UI/back end use "_empty_".
function pubPrefix(p: { Prefix: string }) {
  return p.Prefix && p.Prefix !== "." ? p.Prefix : "_empty_";
}
function pubLabel(p: { Prefix: string; Distribution: string }) {
  const pfx = p.Prefix && p.Prefix !== "." ? p.Prefix : "(root)";
  return `${pfx} / ${p.Distribution}`;
}

function ScheduleForm({ schedule, onClose }: { schedule?: Schedule; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(schedule?.name || "");
  const [kind, setKind] = useState<"mirror" | "publish">((schedule?.kind as any) || "publish");
  const [cron, setCron] = useState(schedule?.cron || "0 3 * * *");
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [retention, setRetention] = useState(String(schedule?.retention ?? 7));

  // mirror-kind state
  const [mirror, setMirror] = useState(schedule?.mirror || "");
  const [republish, setRepublish] = useState(!!(schedule?.publish_prefix && schedule?.publish_distribution));
  const [target, setTarget] = useState(
    schedule?.publish_prefix && schedule?.publish_distribution
      ? `${schedule.publish_prefix}\n${schedule.publish_distribution}`
      : ""
  );

  // publish-kind state: all publications, or a chosen subset (encoded "prefix\ndist").
  const initialTargets: string[] = (() => {
    try {
      return (JSON.parse(schedule?.targets || "[]") as { prefix: string; distribution: string }[])
        .map((t) => `${t.prefix || "_empty_"}\n${t.distribution}`);
    } catch { return []; }
  })();
  const [allPubs, setAllPubs] = useState(initialTargets.length === 0);
  const [selectedPubs, setSelectedPubs] = useState<string[]>(initialTargets);

  const mirrors = useQuery({
    queryKey: ["mirrors"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/mirrors")).data,
  });
  const publications = useQuery({
    queryKey: ["publish"],
    queryFn: async () => (await api.get<{ Prefix: string; Distribution: string }[]>("/publish")).data,
  });

  function togglePub(key: string) {
    setSelectedPubs((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  const save = useMutation({
    mutationFn: () => {
      let body: Record<string, unknown>;
      if (kind === "publish") {
        const targets = allPubs
          ? []
          : selectedPubs.map((k) => { const [prefix, distribution] = k.split("\n"); return { prefix, distribution }; });
        body = {
          name, kind: "publish", cron, enabled, retention: Number(retention) || 0,
          targets: JSON.stringify(targets), mirror: "", publish_prefix: "", publish_distribution: "",
        };
      } else {
        const [tPrefix, tDist] = republish && target ? target.split("\n") : ["", ""];
        body = {
          name, kind: "mirror", mirror, cron, enabled, retention: Number(retention) || 0,
          publish_prefix: tPrefix, publish_distribution: tDist, targets: "",
        };
      }
      return schedule ? api.patch(`/schedules/${schedule.id}`, body) : api.post("/schedules", body);
    },
    onSuccess: () => {
      toast.success(schedule ? "Schedule updated" : "Schedule created");
      qc.invalidateQueries({ queryKey: ["schedules"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const invalid =
    !name || !cron ||
    (kind === "mirror" && (!mirror || (republish && !target))) ||
    (kind === "publish" && !allPubs && selectedPubs.length === 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={schedule ? "Edit Schedule" : "Create Schedule"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()} disabled={invalid}>
            {schedule ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="nightly-refresh" /></div>

        <div>
          <Label>What to run</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="publish">Refresh publications — sync, snapshot &amp; re-publish</option>
            <option value="mirror">Sync a single mirror</option>
          </Select>
        </div>

        {kind === "publish" ? (
          <div className="rounded-lg border border-slate-800 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={allPubs} onChange={(e) => setAllPubs(e.target.checked)} />
              All publications
            </label>
            {!allPubs && (
              <div className="mt-2 space-y-1">
                {(publications.data || []).length === 0 && <p className="text-xs text-slate-500">No publications yet.</p>}
                {(publications.data || []).map((p) => {
                  const key = `${pubPrefix(p)}\n${p.Distribution}`;
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={selectedPubs.includes(key)} onChange={() => togglePub(key)} />
                      {pubLabel(p)}
                    </label>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Each run syncs every mirror behind these publications, creates a timestamped snapshot of
              each, and switches every component to its new snapshot — the whole fleet in one job.
            </p>
          </div>
        ) : (
          <>
            <div>
              <Label>Mirror</Label>
              <Select value={mirror} onChange={(e) => setMirror(e.target.value)}>
                <option value="">Select…</option>
                {(mirrors.data || []).map((m) => <option key={m.Name} value={m.Name}>{m.Name}</option>)}
              </Select>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={republish} onChange={(e) => setRepublish(e.target.checked)} />
                Snapshot &amp; re-publish after each sync
              </label>
              {republish && (
                <div className="mt-3">
                  <Label>Published target to switch</Label>
                  <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Select a publication…</option>
                    {(publications.data || []).map((p) => (
                      <option key={pubLabel(p)} value={`${pubPrefix(p)}\n${p.Distribution}`}>{pubLabel(p)}</option>
                    ))}
                  </Select>
                  <p className="mt-2 text-xs text-slate-500">
                    Best for a single-component publication. For multi-component repos use
                    “Refresh publications” instead.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        <div>
          <Label>Schedule (cron)</Label>
          <div className="flex gap-2">
            {/* Wrappers own the width; Input/Select are w-full by default. */}
            <div className="min-w-0 flex-1">
              <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 3 * * *" />
            </div>
            <div className="w-40 shrink-0">
              <Select value="" onChange={(e) => e.target.value && setCron(e.target.value)}>
                <option value="">Presets…</option>
                {CRON_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </div>
          </div>
        </div>

        <div>
          <Label>Keep snapshots per mirror (0 = keep all)</Label>
          <Input type="number" min="0" value={retention} onChange={(e) => setRetention(e.target.value.replace(/[^0-9]/g, ""))} className="w-32" />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>
    </Modal>
  );
}
