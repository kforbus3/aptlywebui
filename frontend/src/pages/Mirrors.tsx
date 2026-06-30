import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Select, Modal, Table, Badge, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface Mirror {
  Name: string;
  ArchiveRoot: string;
  Distribution: string;
  Components: string[];
  Architectures: string[];
}

const PRESETS: Record<string, { url: string; dist: string; comps: string }> = {
  "Debian Bookworm": { url: "http://deb.debian.org/debian", dist: "bookworm", comps: "main contrib non-free" },
  "Debian Bullseye": { url: "http://deb.debian.org/debian", dist: "bullseye", comps: "main contrib" },
  "Ubuntu Jammy": { url: "http://archive.ubuntu.com/ubuntu", dist: "jammy", comps: "main restricted universe" },
  "Ubuntu Noble": { url: "http://archive.ubuntu.com/ubuntu", dist: "noble", comps: "main restricted universe" },
};

export default function Mirrors() {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole("operator");
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mirrors"],
    queryFn: async () => (await api.get<Mirror[]>("/mirrors")).data,
  });

  const sync = useMutation({
    mutationFn: (name: string) => api.post(`/mirrors/${name}/update`, {}),
    onSuccess: () => {
      toast.success("Mirror update started");
      qc.invalidateQueries({ queryKey: ["mirrors"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.delete(`/mirrors/${name}`, { params: { force: true } }),
    onSuccess: () => {
      toast.success("Mirror deleted");
      qc.invalidateQueries({ queryKey: ["mirrors"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Mirrors"
        subtitle="Mirror upstream Debian/Ubuntu repositories"
        actions={
          canEdit && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New Mirror
            </Button>
          )
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Database size={32} />} title="No mirrors yet" hint="Create a mirror to sync packages from an upstream repository." />
        ) : (
          <Table head={["Name", "Distribution", "Components", "Architectures", ""]}>
            {data.map((m) => (
              <tr key={m.Name} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-slate-200">{m.Name}</td>
                <td className="px-4 py-3"><Badge color="blue">{m.Distribution}</Badge></td>
                <td className="px-4 py-3 text-slate-400">{m.Components?.join(", ")}</td>
                <td className="px-4 py-3 text-slate-400">{m.Architectures?.join(", ")}</td>
                <td className="px-4 py-3">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" loading={sync.isPending && sync.variables === m.Name}
                        onClick={() => sync.mutate(m.Name)}>
                        <RefreshCw size={13} /> Sync
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => { if (confirm(`Delete mirror "${m.Name}"?`)) remove.mutate(m.Name); }}>
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
      {showCreate && <CreateMirror onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateMirror({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [dist, setDist] = useState("");
  const [comps, setComps] = useState("main");
  const [archs, setArchs] = useState("amd64");

  const create = useMutation({
    mutationFn: () =>
      api.post("/mirrors", {
        Name: name,
        ArchiveURL: url,
        Distribution: dist,
        Components: comps.split(/\s+/).filter(Boolean),
        Architectures: archs.split(/[\s,]+/).filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("Mirror created");
      qc.invalidateQueries({ queryKey: ["mirrors"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function applyPreset(key: string) {
    const p = PRESETS[key];
    if (!p) return;
    setUrl(p.url);
    setDist(p.dist);
    setComps(p.comps);
    if (!name) setName(key.toLowerCase().replace(/\s+/g, "-"));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Create Mirror"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={() => create.mutate()} disabled={!name || !url || !dist}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Preset</Label>
          <Select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="">Custom…</option>
            {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </div>
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="debian-bookworm" /></div>
        <div><Label>Archive URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://deb.debian.org/debian" /></div>
        <div><Label>Distribution</Label><Input value={dist} onChange={(e) => setDist(e.target.value)} placeholder="bookworm" /></div>
        <div><Label>Components (space-separated)</Label><Input value={comps} onChange={(e) => setComps(e.target.value)} /></div>
        <div><Label>Architectures (comma/space-separated)</Label><Input value={archs} onChange={(e) => setArchs(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
