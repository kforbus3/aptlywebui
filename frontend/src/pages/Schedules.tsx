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
  mirror: string;
  cron: string;
  enabled: boolean;
  publish_prefix?: string;
  publish_distribution?: string;
  last_run?: string;
  last_status?: string;
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
          <Table head={["Name", "Mirror", "Cron", "Enabled", "Last Status", ""]}>
            {data.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-slate-200">{s.name}</td>
                <td className="px-4 py-3 text-slate-400">{s.mirror}</td>
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
  const [mirror, setMirror] = useState(schedule?.mirror || "");
  const [cron, setCron] = useState(schedule?.cron || "");
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [republish, setRepublish] = useState(
    !!(schedule?.publish_prefix && schedule?.publish_distribution)
  );
  // Encodes the selected publication as "<prefix>\n<distribution>".
  const [target, setTarget] = useState(
    schedule?.publish_prefix && schedule?.publish_distribution
      ? `${schedule.publish_prefix}\n${schedule.publish_distribution}`
      : ""
  );

  const mirrors = useQuery({
    queryKey: ["mirrors"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/mirrors")).data,
  });
  const publications = useQuery({
    queryKey: ["publish"],
    queryFn: async () => (await api.get<{ Prefix: string; Distribution: string }[]>("/publish")).data,
  });

  const save = useMutation({
    mutationFn: () => {
      const [tPrefix, tDist] = republish && target ? target.split("\n") : ["", ""];
      // Send empty strings (not undefined) so clearing the publish target
      // actually clears it (the PATCH uses exclude_unset).
      const body = {
        name,
        mirror,
        cron,
        enabled,
        publish_prefix: tPrefix,
        publish_distribution: tDist,
      };
      return schedule ? api.patch(`/schedules/${schedule.id}`, body) : api.post("/schedules", body);
    },
    onSuccess: () => {
      toast.success(schedule ? "Schedule updated" : "Schedule created");
      qc.invalidateQueries({ queryKey: ["schedules"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const missingTarget = republish && !target;

  return (
    <Modal
      open
      onClose={onClose}
      title={schedule ? "Edit Schedule" : "Create Schedule"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()} disabled={!name || !mirror || !cron || missingTarget}>
            {schedule ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="nightly-sync" /></div>
        <div>
          <Label>Mirror</Label>
          <Select value={mirror} onChange={(e) => setMirror(e.target.value)}>
            <option value="">Select…</option>
            {(mirrors.data || []).map((m) => <option key={m.Name} value={m.Name}>{m.Name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Schedule (cron)</Label>
          <div className="flex gap-2">
            <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 3 * * *" className="flex-1" />
            <Select value="" onChange={(e) => e.target.value && setCron(e.target.value)} className="w-40">
              <option value="">Presets…</option>
              {CRON_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>

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
                Each run creates a timestamped snapshot from the mirror and switches this
                published distribution to it. Leave unchecked to only refresh the mirror.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
