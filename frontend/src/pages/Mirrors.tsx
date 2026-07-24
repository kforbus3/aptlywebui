import { useEffect, useRef, useState } from "react";
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

interface Preset {
  url: string;
  dist: string;
  comps: string;
  auth?: boolean; // requires an Ubuntu Pro token (HTTP basic auth to esm.ubuntu.com)
}

// Each preset carries the full set of components that distribution actually
// publishes, so selecting one auto-populates every available component.
// Debian gained non-free-firmware in Bookworm (12); Bullseye (11) predates it.
const DISTRO_PRESETS: Record<string, Preset> = {
  "Debian Trixie (13)": { url: "http://deb.debian.org/debian", dist: "trixie", comps: "main contrib non-free non-free-firmware" },
  "Debian Bookworm (12)": { url: "http://deb.debian.org/debian", dist: "bookworm", comps: "main contrib non-free non-free-firmware" },
  "Debian Bullseye (11)": { url: "http://deb.debian.org/debian", dist: "bullseye", comps: "main contrib non-free" },
  "Ubuntu Noble (24.04)": { url: "http://archive.ubuntu.com/ubuntu", dist: "noble", comps: "main restricted universe multiverse" },
  "Ubuntu Jammy (22.04)": { url: "http://archive.ubuntu.com/ubuntu", dist: "jammy", comps: "main restricted universe multiverse" },
};

// Ubuntu Pro (ESM/FIPS) mirrors. These live behind esm.ubuntu.com and require a
// per-service auth token (the "bearer" password from `pro attach`). Each service
// publishes a security and an updates suite; a mirror covers one suite, so we
// generate a preset per (service, suite, release). Component is always "main".
const PRO_RELEASES: { code: string; label: string }[] = [
  { code: "jammy", label: "Jammy 22.04" },
  { code: "focal", label: "Focal 20.04" },
  { code: "bionic", label: "Bionic 18.04" },
  { code: "xenial", label: "Xenial 16.04" },
];
const PRO_SERVICES: { label: string; url: string; suite: (r: string) => string }[] = [
  { label: "ESM Infra (security)", url: "https://esm.ubuntu.com/infra/ubuntu", suite: (r) => `${r}-infra-security` },
  { label: "ESM Infra (updates)", url: "https://esm.ubuntu.com/infra/ubuntu", suite: (r) => `${r}-infra-updates` },
  { label: "ESM Apps (security)", url: "https://esm.ubuntu.com/apps/ubuntu", suite: (r) => `${r}-apps-security` },
  { label: "ESM Apps (updates)", url: "https://esm.ubuntu.com/apps/ubuntu", suite: (r) => `${r}-apps-updates` },
  { label: "FIPS", url: "https://esm.ubuntu.com/fips/ubuntu", suite: (r) => r },
  { label: "FIPS Updates", url: "https://esm.ubuntu.com/fips-updates/ubuntu", suite: (r) => `${r}-updates` },
];

// Pro presets grouped by release (for <optgroup>), keyed by a unique label.
const PRO_GROUPS: { group: string; presets: Record<string, Preset> }[] = PRO_RELEASES.map((rel) => ({
  group: `Ubuntu Pro — ${rel.label}`,
  presets: Object.fromEntries(
    PRO_SERVICES.map((svc) => [
      `${svc.label} — ${rel.label}`,
      { url: svc.url, dist: svc.suite(rel.code), comps: "main", auth: true } as Preset,
    ]),
  ),
}));

// Flat lookup across every preset, for applyPreset.
const ALL_PRESETS: Record<string, Preset> = {
  ...DISTRO_PRESETS,
  ...Object.fromEntries(PRO_GROUPS.flatMap((g) => Object.entries(g.presets))),
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

  // Poll aptly's live task list at the page level so an in-progress sync is
  // ALWAYS visible here — regardless of who started it or whether the page was
  // reloaded. Every row and its Sync button read from this single source.
  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get<any[]>("/tasks")).data,
    refetchInterval: 3000,
  });
  const syncing = (name: string) => isRunningSync(tasks, name);

  // When any mirror finishes syncing, refresh the mirror list so package counts
  // and status update even for observers who never clicked Sync themselves.
  const runningKey = (tasks || [])
    .filter((t) => t?.State === 0 || t?.State === 1)
    .map((t) => t?.Name)
    .sort()
    .join("|");
  const prevRunningKey = useRef(runningKey);
  useEffect(() => {
    if (prevRunningKey.current !== runningKey) {
      qc.invalidateQueries({ queryKey: ["mirrors"] });
      prevRunningKey.current = runningKey;
    }
  }, [runningKey, qc]);

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
          <Table head={["Name", "Distribution", "Components", "Architectures", "Status", ""]}>
            {data.map((m) => (
              <tr key={m.Name} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-slate-200">{m.Name}</td>
                <td className="px-4 py-3"><Badge color="blue">{m.Distribution}</Badge></td>
                <td className="px-4 py-3 text-slate-400">{m.Components?.join(", ")}</td>
                <td className="px-4 py-3 text-slate-400">{m.Architectures?.join(", ")}</td>
                <td className="px-4 py-3">
                  {syncing(m.Name) ? (
                    <Badge color="amber">
                      <RefreshCw size={11} className="mr-1 animate-spin" /> Syncing…
                    </Badge>
                  ) : (
                    <Badge color="slate">Idle</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <SyncButton mirror={m.Name} running={syncing(m.Name)} />
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
// aptly names a mirror-update task "Update mirror <name>"; States 0/1 are
// init/running, 2 succeeded, 3 failed.
function isRunningSync(tasks: any[] | undefined, mirror: string): boolean {
  return (tasks || []).some(
    (t) => t?.Name === `Update mirror ${mirror}` && (t.State === 0 || t.State === 1),
  );
}

function SyncButton({ mirror, running }: { mirror: string; running: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [taskId, setTaskId] = useState<number | null>(null);

  const start = useMutation({
    mutationFn: () => api.post(`/mirrors/${mirror}/update`, {}),
    onSuccess: (res) => {
      const id = (res.data as any)?.ID;
      if (id != null) setTaskId(id);
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  // Completion toast for the session that started the sync. Whether the button
  // is busy comes from the page-level task list (the `running` prop), so it
  // stays correct across reloads and for syncs started elsewhere.
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
    } else {
      // Failed — surface aptly's task output as the error detail.
      api.get(`/tasks/${taskId}/output`)
        .then((r) => toast.error(`${mirror} sync failed: ${((r.data as any)?.output || "").trim().slice(-300) || "unknown error"}`))
        .catch(() => toast.error(`${mirror} sync failed`));
    }
    qc.invalidateQueries({ queryKey: ["mirrors"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    setTaskId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const busy = start.isPending || running || taskId != null;
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
  const [token, setToken] = useState("");

  // Ubuntu Pro archives (esm.ubuntu.com) require an auth token; detect it from
  // the URL so it works for presets and hand-typed URLs alike.
  const needsAuth = /(^|\.)esm\.ubuntu\.com/.test(url);

  const create = useMutation({
    mutationFn: () =>
      api.post("/mirrors", {
        Name: name,
        ArchiveURL: url,
        Distribution: dist,
        Components: comps.split(/\s+/).filter(Boolean),
        Architectures: archs.split(/[\s,]+/).filter(Boolean),
        // AuthToken is spliced into the archive URL as HTTP basic auth by the
        // backend and never stored/echoed separately.
        ...(needsAuth && token ? { AuthToken: token } : {}),
      }),
    onSuccess: () => {
      toast.success("Mirror created");
      qc.invalidateQueries({ queryKey: ["mirrors"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function applyPreset(key: string) {
    const p = ALL_PRESETS[key];
    if (!p) return;
    setUrl(p.url);
    setDist(p.dist);
    setComps(p.comps);
    // Derive a clean mirror name, dropping "(13)" labels and the " — Release"
    // suffix on Pro presets (e.g. "esm-infra-security-jammy").
    if (!name) {
      setName(
        key.toLowerCase()
          .replace(/\s*\(.*?\)/g, "")
          .replace(/\s*—\s*/g, "-")
          .trim()
          .replace(/\s+/g, "-"),
      );
    }
  }

  const canCreate = !!name && !!url && !!dist && (!needsAuth || !!token);

  return (
    <Modal
      open
      onClose={onClose}
      title="Create Mirror"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={() => create.mutate()} disabled={!canCreate}>
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
            <optgroup label="Debian / Ubuntu">
              {Object.keys(DISTRO_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
            </optgroup>
            {PRO_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {Object.keys(g.presets).map((k) => <option key={k} value={k}>{k}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="debian-bookworm" /></div>
        <div><Label>Archive URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://deb.debian.org/debian" /></div>
        <div><Label>Distribution</Label><Input value={dist} onChange={(e) => setDist(e.target.value)} placeholder="bookworm" /></div>
        <div><Label>Components (space-separated)</Label><Input value={comps} onChange={(e) => setComps(e.target.value)} /></div>
        <div><Label>Architectures (comma/space-separated)</Label><Input value={archs} onChange={(e) => setArchs(e.target.value)} /></div>
        {needsAuth && (
          <div>
            <Label>Ubuntu Pro auth token</Label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="resource token from `pro attach`" autoComplete="off" />
            <p className="mt-1 text-xs text-slate-500">
              The per-service token from <code>/etc/apt/auth.conf.d/</code> (the password after
              <code> login bearer</code>). Sent once, stored in the mirror URL, and never shown again.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
