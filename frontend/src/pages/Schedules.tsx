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

function ScheduleForm({ schedule, onClose }: { schedule?: Schedule; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(schedule?.name || "");
  const [mirror, setMirror] = useState(schedule?.mirror || "");
  const [cron, setCron] = useState(schedule?.cron || "");
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [prefix, setPrefix] = useState(schedule?.publish_prefix || "");
  const [distribution, setDistribution] = useState(schedule?.publish_distribution || "");

  const mirrors = useQuery({
    queryKey: ["mirrors"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/mirrors")).data,
  });

  const save = useMutation({
    mutationFn: () => {
      // Send empty strings (not undefined) so clearing a field actually clears
      // it: JSON.stringify drops undefined, and the PATCH uses exclude_unset,
      // which would otherwise keep the old publish target.
      const body = {
        name,
        mirror,
        cron,
        enabled,
        publish_prefix: prefix,
        publish_distribution: distribution,
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

  return (
    <Modal
      open
      onClose={onClose}
      title={schedule ? "Edit Schedule" : "Create Schedule"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()} disabled={!name || !mirror || !cron}>
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
        <div><Label>Cron</Label><Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 3 * * *" /></div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
        <div><Label>Publish Prefix (optional)</Label><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="_empty_" /></div>
        <div><Label>Publish Distribution (optional)</Label><Input value={distribution} onChange={(e) => setDistribution(e.target.value)} placeholder="bookworm" /></div>
      </div>
    </Modal>
  );
}
