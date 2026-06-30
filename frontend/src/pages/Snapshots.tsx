import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Trash2, Package } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Select, Modal, Table, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface Snapshot {
  Name: string;
  Description: string;
  CreatedAt: string;
}

export default function Snapshots() {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole("operator");
  const [showCreate, setShowCreate] = useState(false);
  const [viewPackages, setViewPackages] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => (await api.get<Snapshot[]>("/snapshots")).data,
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.delete(`/snapshots/${name}`, { params: { force: true } }),
    onSuccess: () => {
      toast.success("Snapshot deleted");
      qc.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Snapshots"
        subtitle="Immutable point-in-time captures of repos and mirrors"
        actions={
          canEdit && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New Snapshot
            </Button>
          )
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Camera size={32} />} title="No snapshots yet" hint="Create a snapshot from a mirror or local repo." />
        ) : (
          <Table head={["Name", "Description", "Created", ""]}>
            {data.map((s) => (
              <tr key={s.Name} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-slate-200">{s.Name}</td>
                <td className="px-4 py-3 text-slate-400">{s.Description}</td>
                <td className="px-4 py-3 text-slate-400">{s.CreatedAt ? new Date(s.CreatedAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setViewPackages(s.Name)}>
                      <Package size={13} /> Packages
                    </Button>
                    {canEdit && (
                      <Button size="sm" variant="ghost"
                        onClick={() => { if (confirm(`Delete snapshot "${s.Name}"?`)) remove.mutate(s.Name); }}>
                        <Trash2 size={14} className="text-red-400" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {showCreate && <CreateSnapshot onClose={() => setShowCreate(false)} />}
      {viewPackages && <ViewPackages snapshot={viewPackages} onClose={() => setViewPackages(null)} />}
    </div>
  );
}

function CreateSnapshot({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [sourceType, setSourceType] = useState<"mirror" | "repo">("mirror");
  const [source, setSource] = useState("");
  const [name, setName] = useState("");

  const mirrors = useQuery({
    queryKey: ["mirrors"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/mirrors")).data,
  });
  const repos = useQuery({
    queryKey: ["repos"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/repos")).data,
  });
  const sources = sourceType === "mirror" ? mirrors.data : repos.data;

  const create = useMutation({
    mutationFn: () =>
      api.post(
        sourceType === "mirror" ? `/snapshots/from-mirror/${source}` : `/snapshots/from-repo/${source}`,
        { Name: name },
      ),
    onSuccess: () => {
      toast.success("Snapshot created");
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Create Snapshot"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={() => create.mutate()} disabled={!source || !name}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Source Type</Label>
          <Select value={sourceType} onChange={(e) => { setSourceType(e.target.value as "mirror" | "repo"); setSource(""); }}>
            <option value="mirror">Mirror</option>
            <option value="repo">Local Repo</option>
          </Select>
        </div>
        <div>
          <Label>Source</Label>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Select…</option>
            {(sources || []).map((s) => <option key={s.Name} value={s.Name}>{s.Name}</option>)}
          </Select>
        </div>
        <div><Label>Snapshot Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-snapshot" /></div>
      </div>
    </Modal>
  );
}

function ViewPackages({ snapshot, onClose }: { snapshot: string; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["snapshot-packages", snapshot],
    queryFn: async () => (await api.get<string[]>(`/snapshots/${snapshot}/packages`)).data,
  });
  const filtered = (data || []).filter((p) => p.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Modal open onClose={onClose} title={`Packages in ${snapshot}`}>
      <div className="space-y-3">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter packages…" />
        {isLoading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Package size={28} />} title="No packages" />
        ) : (
          <>
            <p className="text-xs text-slate-500">{filtered.length} package(s)</p>
            <ul className="space-y-1 font-mono text-xs text-slate-300">
              {filtered.map((p) => <li key={p} className="rounded bg-slate-950 px-2 py-1">{p}</li>)}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
