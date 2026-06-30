import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, Plus, Trash2, RefreshCw } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Select, Modal, Table, Badge, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface PublishSource {
  Component: string;
  Name: string;
}
interface Published {
  Prefix: string;
  Distribution: string;
  SourceKind: string;
  Sources: PublishSource[];
  Architectures: string[];
  Storage: string;
}

function prefixOf(p: Published) {
  return p.Prefix && p.Prefix !== "" ? p.Prefix : "_empty_";
}

export default function Publish() {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole("operator");
  const [showCreate, setShowCreate] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<Published | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["publish"],
    queryFn: async () => (await api.get<Published[]>("/publish")).data,
  });

  const unpublish = useMutation({
    mutationFn: (p: Published) =>
      api.delete(`/publish/${prefixOf(p)}/${p.Distribution}`, { params: { force: true } }),
    onSuccess: () => {
      toast.success("Unpublished");
      qc.invalidateQueries({ queryKey: ["publish"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Published"
        subtitle="Published distributions served to apt clients"
        actions={
          canEdit && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Publish Snapshot
            </Button>
          )
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<UploadCloud size={32} />} title="Nothing published yet" hint="Publish a snapshot to serve it over apt." />
        ) : (
          <Table head={["Prefix", "Distribution", "Kind", "Sources", "Architectures", ""]}>
            {data.map((p) => (
              <tr key={`${p.Prefix}/${p.Distribution}`} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-slate-300">{p.Prefix || "(root)"}</td>
                <td className="px-4 py-3"><Badge color="blue">{p.Distribution}</Badge></td>
                <td className="px-4 py-3 text-slate-400">{p.SourceKind}</td>
                <td className="px-4 py-3 text-slate-400">{p.Sources?.map((s) => s.Name).join(", ")}</td>
                <td className="px-4 py-3 text-slate-400">{p.Architectures?.join(", ")}</td>
                <td className="px-4 py-3">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setSwitchTarget(p)}>
                        <RefreshCw size={13} /> Switch
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => { if (confirm(`Unpublish "${p.Prefix || "(root)"}/${p.Distribution}"?`)) unpublish.mutate(p); }}>
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
      {showCreate && <PublishSnapshot onClose={() => setShowCreate(false)} />}
      {switchTarget && <SwitchSnapshot target={switchTarget} onClose={() => setSwitchTarget(null)} />}
    </div>
  );
}

function SwitchSnapshot({ target, onClose }: { target: Published; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [snapshot, setSnapshot] = useState("");

  const snapshots = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/snapshots")).data,
  });

  const swap = useMutation({
    mutationFn: () =>
      api.put(`/publish/${prefixOf(target)}/${target.Distribution}`, {
        Snapshots: [{ Component: "main", Name: snapshot }],
      }),
    onSuccess: () => {
      toast.success("Snapshot switched");
      qc.invalidateQueries({ queryKey: ["publish"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Switch snapshot — ${target.Prefix || "(root)"}/${target.Distribution}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={swap.isPending} onClick={() => swap.mutate()} disabled={!snapshot}>
            Switch
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>New Snapshot</Label>
          <Select value={snapshot} onChange={(e) => setSnapshot(e.target.value)}>
            <option value="">Select…</option>
            {(snapshots.data || []).map((s) => <option key={s.Name} value={s.Name}>{s.Name}</option>)}
          </Select>
        </div>
      </div>
    </Modal>
  );
}

function PublishSnapshot({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [snapshot, setSnapshot] = useState("");
  const [distribution, setDistribution] = useState("");
  const [archs, setArchs] = useState("amd64");
  const [prefix, setPrefix] = useState("_empty_");
  const [sign, setSign] = useState(false);

  const snapshots = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/snapshots")).data,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post(`/publish/${prefix || "_empty_"}`, {
        SourceKind: "snapshot",
        Sources: [{ Name: snapshot, Component: "main" }],
        Distribution: distribution,
        Architectures: archs.split(/[\s,]+/).filter(Boolean),
        Signing: sign ? { Batch: true } : { Skip: true },
      }),
    onSuccess: () => {
      toast.success("Snapshot published");
      qc.invalidateQueries({ queryKey: ["publish"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Publish Snapshot"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={() => create.mutate()} disabled={!snapshot || !distribution}>
            Publish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Snapshot</Label>
          <Select value={snapshot} onChange={(e) => setSnapshot(e.target.value)}>
            <option value="">Select…</option>
            {(snapshots.data || []).map((s) => <option key={s.Name} value={s.Name}>{s.Name}</option>)}
          </Select>
        </div>
        <div><Label>Distribution</Label><Input value={distribution} onChange={(e) => setDistribution(e.target.value)} placeholder="bookworm" /></div>
        <div><Label>Architectures (comma/space-separated)</Label><Input value={archs} onChange={(e) => setArchs(e.target.value)} /></div>
        <div><Label>Prefix (use "_empty_" for root)</Label><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} />
          GPG sign (otherwise published unsigned)
        </label>
      </div>
    </Modal>
  );
}
