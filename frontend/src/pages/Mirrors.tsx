import { useEffect, useState } from "react";
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

// Each preset carries the full set of components that distribution actually
// publishes, so selecting one auto-populates every available component.
// Debian gained non-free-firmware in Bookworm (12); Bullseye (11) predates it.
const PRESETS: Record<string, { url: string; dist: string; comps: string }> = {
  "Debian Trixie (13)": { url: "http://deb.debian.org/debian", dist: "trixie", comps: "main contrib non-free non-free-firmware" },
  "Debian Bookworm (12)": { url: "http://deb.debian.org/debian", dist: "bookworm", comps: "main contrib non-free non-free-firmware" },
  "Debian Bullseye (11)": { url: "http://deb.debian.org/debian", dist: "bullseye", comps: "main contrib non-free" },
  "Ubuntu Noble (24.04)": { url: "http://archive.ubuntu.com/ubuntu", dist: "noble", comps: "main restricted universe multiverse" },
  "Ubuntu Jammy (22.04)": { url: "http://archive.ubuntu.com/ubuntu", dist: "jammy", comps: "main restricted universe multiverse" },
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
                      <SyncButton mirror={m.Name} />
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

// Triggers an async aptly mirror update and polls the resulting task to
// completion, so a long sync never blocks the request or the UI.
function SyncButton({ mirror }: { mirror: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [taskId, setTaskId] = useState<number | null>(null);

  const start = useMutation({
    mutationFn: () => api.post(`/mirrors/${mirror}/update`, {}),
    onSuccess: (res) => {
      const id = (res.data as any)?.ID;
      if (id != null) {
        setTaskId(id);
        qc.invalidateQueries({ queryKey: ["tasks"] });
      } else {
        toast.success(`${mirror} synced`);
      }
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}`)).data as any,
    enabled: taskId != null,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.State;
      return s === 2 || s === 3 ? false : 1500;
    },
  });

  const state = (task.data as any)?.State;
  useEffect(() => {
    if (state !== 2 && state !== 3) return;
    if (state === 2) {
      toast.success(`${mirror} synced`);
      qc.invalidateQueries({ queryKey: ["mirrors"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setTaskId(null);
    } else {
      // Failed — surface aptly's task output as the error detail.
      api.get(`/tasks/${taskId}/output`)
        .then((r) => toast.error(`${mirror} sync failed: ${((r.data as any)?.output || "").trim().slice(-300) || "unknown error"}`))
        .catch(() => toast.error(`${mirror} sync failed`))
        .finally(() => setTaskId(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const busy = start.isPending || taskId != null;
  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={() => start.mutate()}>
      <RefreshCw size={13} /> {busy ? "Syncing…" : "Sync"}
    </Button>
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
    // Derive a clean mirror name (e.g. "debian-trixie"), dropping the "(13)" label.
    if (!name) setName(key.toLowerCase().replace(/\s*\(.*\)/, "").trim().replace(/\s+/g, "-"));
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
