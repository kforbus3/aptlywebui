import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, Plus, Trash2, RefreshCw, Terminal } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Select, Modal, Table, Badge, Spinner, EmptyState, PageHeader,
} from "../components/ui";

// A publish/republish runs as a background aptly task (index + Contents +
// signing can take minutes). This hook polls the task to completion, reports the
// result, and refreshes the publications list. Returns a `start(id)` to hand it
// the task id and a `busy` flag for the running state.
function usePublishTask(label: string, onDone: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  const [taskId, setTaskId] = useState<number | null>(null);
  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => (await api.get(`/tasks/${taskId}`)).data as any,
    enabled: taskId != null,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.State;
      return s === 2 || s === 3 ? false : 1200;
    },
  });
  const state = (task.data as any)?.State;
  useEffect(() => {
    if (state !== 2 && state !== 3) return;
    if (state === 2) {
      toast.success(`${label} complete`);
    } else {
      api.get(`/tasks/${taskId}/output`)
        .then((r) => toast.error(`${label} failed: ${((r.data as any)?.output || "").trim().slice(-300) || "unknown error"}`))
        .catch(() => toast.error(`${label} failed`));
    }
    qc.invalidateQueries({ queryKey: ["publish"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    setTaskId(null);
    onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return { start: (id: number) => setTaskId(id), busy: taskId != null };
}

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

// aptly represents the root prefix as either "" or "."; both map to the
// backend's "_empty_" sentinel for use in request paths.
function prefixOf(p: Published) {
  return p.Prefix && p.Prefix !== "" && p.Prefix !== "." ? p.Prefix : "_empty_";
}

function displayPrefix(p: Published) {
  return p.Prefix && p.Prefix !== "." ? p.Prefix : "(root)";
}

export default function Publish() {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole("operator");
  const [showCreate, setShowCreate] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<Published | null>(null);
  const [refreshTarget, setRefreshTarget] = useState<Published | null>(null);
  const [setupTarget, setSetupTarget] = useState<Published | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["publish"],
    queryFn: async () => (await api.get<Published[]>("/publish")).data,
  });

  // Live task list, so an in-progress publish is visible here and the list
  // refreshes when one finishes — even for observers who didn't start it.
  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get<any[]>("/tasks")).data,
    refetchInterval: 3000,
  });
  const publishing = (tasks || []).filter(
    (t) => typeof t?.Name === "string" && /publish/i.test(t.Name) && (t.State === 0 || t.State === 1),
  );
  const runningKey = publishing.map((t) => t.Name).sort().join("|");
  const prevRunningKey = useRef(runningKey);
  useEffect(() => {
    if (prevRunningKey.current !== runningKey) {
      qc.invalidateQueries({ queryKey: ["publish"] });
      prevRunningKey.current = runningKey;
    }
  }, [runningKey, qc]);

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
              <Plus size={15} /> Publish
            </Button>
          )
        }
      />
      {publishing.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
          <RefreshCw size={14} className="animate-spin" />
          {publishing.length} publish{publishing.length > 1 ? "es" : ""} in progress — generating indexes and signing. This can take a few minutes for large repos.
        </div>
      )}
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<UploadCloud size={32} />} title="Nothing published yet" hint="Publish a snapshot to serve it over apt." />
        ) : (
          <Table head={["Prefix", "Distribution", "Kind", "Sources", "Architectures", ""]}>
            {data.map((p) => (
              <tr key={`${p.Prefix}/${p.Distribution}`} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-slate-300">{displayPrefix(p)}</td>
                <td className="px-4 py-3"><Badge color="blue">{p.Distribution}</Badge></td>
                <td className="px-4 py-3 text-slate-400">{p.SourceKind}</td>
                <td className="px-4 py-3 text-slate-400">{p.Sources?.map((s) => s.Name).join(", ")}</td>
                <td className="px-4 py-3 text-slate-400">{p.Architectures?.join(", ")}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setSetupTarget(p)} title="apt client setup">
                      <Terminal size={14} className="text-slate-400" />
                    </Button>
                    {canEdit && (
                      <>
                        {p.SourceKind === "local" ? (
                          <Button size="sm" variant="secondary" onClick={() => setRefreshTarget(p)}>
                            <RefreshCw size={13} /> Refresh
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setSwitchTarget(p)}>
                            <RefreshCw size={13} /> Switch
                          </Button>
                        )}
                        <Button size="sm" variant="ghost"
                          onClick={() => { if (confirm(`Unpublish "${displayPrefix(p)}/${p.Distribution}"?`)) unpublish.mutate(p); }}>
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {showCreate && <PublishForm onClose={() => setShowCreate(false)} />}
      {switchTarget && <SwitchSnapshot target={switchTarget} onClose={() => setSwitchTarget(null)} />}
      {refreshTarget && <RefreshRepo target={refreshTarget} onClose={() => setRefreshTarget(null)} />}
      {setupTarget && <ClientSetup target={setupTarget} onClose={() => setSetupTarget(null)} />}
    </div>
  );
}

// Shows copy-paste apt client setup commands for a publication, using the repo
// server (this host) — the bundled nginx serves the repo at / and the signing
// key at /gpg/public.key.
function ClientSetup({ target, onClose }: { target: Published; onClose: () => void }) {
  const toast = useToast();
  const [port, setPort] = useState("");
  const host = window.location.hostname;
  const base = `http://${host}${port ? `:${port}` : ""}`;
  const prefix = target.Prefix && target.Prefix !== "." ? `${target.Prefix.replace(/^\/+|\/+$/g, "")}/` : "";
  const components = (target.Sources?.map((s) => s.Component).filter(Boolean).join(" ")) || "main";
  // Install the key into apt's trusted keyring directory so it applies globally
  // and the sources line needs no signed-by= option.
  const keyring = "/etc/apt/trusted.gpg.d/aptly-repo.gpg";
  const script = [
    `# Import the repository signing key (trusted for all sources)`,
    `curl -fsSL ${base}/gpg/public.key | sudo gpg --dearmor -o ${keyring}`,
    ``,
    `# Add the repository`,
    `echo "deb ${base}/${prefix} ${target.Distribution} ${components}" \\`,
    `  | sudo tee /etc/apt/sources.list.d/aptly-repo.list`,
    ``,
    `sudo apt update`,
  ].join("\n");

  return (
    <Modal
      open
      onClose={onClose}
      title={`apt setup — ${displayPrefix(target)}/${target.Distribution}`}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          Run these on a Debian/Ubuntu client to install from this repository. The bundled
          repo server serves the packages and signing key on this host.
        </p>
        <div>
          <Label>Repo server port (if not 80)</Label>
          <Input value={port} onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))} placeholder="80" />
        </div>
        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-200 whitespace-pre">{script}</pre>
        <Button
          variant="secondary"
          onClick={() => { navigator.clipboard?.writeText(script); toast.success("Copied to clipboard"); }}
        >
          Copy commands
        </Button>
      </div>
    </Modal>
  );
}

function SwitchSnapshot({ target, onClose }: { target: Published; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [snapshot, setSnapshot] = useState("");
  const [sign, setSign] = useState(true);
  const [skipContents, setSkipContents] = useState(false);
  const pub = usePublishTask("Switch", onClose);

  const snapshots = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/snapshots")).data,
  });

  const swap = useMutation({
    mutationFn: () =>
      // Switch every component the target actually publishes to the new
      // snapshot; hardcoding "main" errors on any non-main/multi-component
      // publication.
      api.put(`/publish/${prefixOf(target)}/${target.Distribution}`, {
        Snapshots: (target.Sources?.length ? target.Sources : [{ Component: "main", Name: "" }]).map(
          (s) => ({ Component: s.Component, Name: snapshot })
        ),
        Signing: sign ? { Batch: true } : { Skip: true },
        SkipContents: skipContents,
      }),
    onSuccess: (res) => {
      const id = (res.data as any)?.ID;
      if (id != null) pub.start(id);
      else { toast.success("Snapshot switched"); qc.invalidateQueries({ queryKey: ["publish"] }); onClose(); }
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const busy = swap.isPending || pub.busy;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Switch snapshot — ${displayPrefix(target)}/${target.Distribution}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{busy ? "Close" : "Cancel"}</Button>
          <Button loading={busy} onClick={() => swap.mutate()} disabled={busy || !snapshot}>
            {busy ? "Switching…" : "Switch"}
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
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} />
          GPG sign
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={skipContents} onChange={(e) => setSkipContents(e.target.checked)} />
          Skip Contents index (faster, smaller)
        </label>
        {busy && (
          <p className="flex items-center gap-2 text-xs text-amber-300">
            <RefreshCw size={12} className="animate-spin" /> Switching… you can close this; progress shows in the sidebar.
          </p>
        )}
      </div>
    </Modal>
  );
}

// Re-reads a directly-published local repo so newly uploaded/removed packages
// reach apt clients without creating a snapshot.
function RefreshRepo({ target, onClose }: { target: Published; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [sign, setSign] = useState(true);
  const [skipContents, setSkipContents] = useState(false);
  const pub = usePublishTask("Refresh", onClose);

  const refresh = useMutation({
    mutationFn: () =>
      api.put(`/publish/${prefixOf(target)}/${target.Distribution}`, {
        Signing: sign ? { Batch: true } : { Skip: true },
        SkipContents: skipContents,
      }),
    onSuccess: (res) => {
      const id = (res.data as any)?.ID;
      if (id != null) pub.start(id);
      else { toast.success("Publication refreshed"); qc.invalidateQueries({ queryKey: ["publish"] }); onClose(); }
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const busy = refresh.isPending || pub.busy;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Refresh — ${displayPrefix(target)}/${target.Distribution}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{busy ? "Close" : "Cancel"}</Button>
          <Button loading={busy} onClick={() => refresh.mutate()} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Re-reads local repo <span className="font-mono text-slate-200">{target.Sources?.map((s) => s.Name).join(", ")}</span> and
          re-publishes it, picking up packages added or removed since the last publish.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} />
          GPG sign
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={skipContents} onChange={(e) => setSkipContents(e.target.checked)} />
          Skip Contents index (faster, smaller)
        </label>
        {busy && (
          <p className="flex items-center gap-2 text-xs text-amber-300">
            <RefreshCw size={12} className="animate-spin" /> Refreshing… you can close this; progress shows in the sidebar.
          </p>
        )}
      </div>
    </Modal>
  );
}

function PublishForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [sourceKind, setSourceKind] = useState<"snapshot" | "local">("snapshot");
  const [source, setSource] = useState("");
  const [distribution, setDistribution] = useState("");
  const [archs, setArchs] = useState("amd64");
  const [prefix, setPrefix] = useState("_empty_");
  const [sign, setSign] = useState(true);
  const [skipContents, setSkipContents] = useState(false);

  const pub = usePublishTask("Publish", onClose);

  const snapshots = useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/snapshots")).data,
  });
  const repos = useQuery({
    queryKey: ["repos"],
    queryFn: async () => (await api.get<{ Name: string }[]>("/repos")).data,
  });
  const sources = sourceKind === "snapshot" ? snapshots.data : repos.data;

  const create = useMutation({
    mutationFn: () =>
      api.post(`/publish/${prefix || "_empty_"}`, {
        SourceKind: sourceKind,
        Sources: [{ Name: source, Component: "main" }],
        Distribution: distribution,
        Architectures: archs.split(/[\s,]+/).filter(Boolean),
        Signing: sign ? { Batch: true } : { Skip: true },
        SkipContents: skipContents,
      }),
    onSuccess: (res) => {
      const id = (res.data as any)?.ID;
      if (id != null) pub.start(id);
      else { toast.success("Published"); qc.invalidateQueries({ queryKey: ["publish"] }); onClose(); }
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const busy = create.isPending || pub.busy;

  return (
    <Modal
      open
      onClose={onClose}
      title="Publish"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{busy ? "Close" : "Cancel"}</Button>
          <Button loading={busy} onClick={() => create.mutate()} disabled={busy || !source || !distribution}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Source Type</Label>
          <Select value={sourceKind} onChange={(e) => { setSourceKind(e.target.value as "snapshot" | "local"); setSource(""); }}>
            <option value="snapshot">Snapshot</option>
            <option value="local">Local Repo (publish directly)</option>
          </Select>
        </div>
        <div>
          <Label>{sourceKind === "snapshot" ? "Snapshot" : "Local Repo"}</Label>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Select…</option>
            {(sources || []).map((s) => <option key={s.Name} value={s.Name}>{s.Name}</option>)}
          </Select>
        </div>
        <div><Label>Distribution</Label><Input value={distribution} onChange={(e) => setDistribution(e.target.value)} placeholder="bookworm" /></div>
        <div><Label>Architectures (comma/space-separated)</Label><Input value={archs} onChange={(e) => setArchs(e.target.value)} /></div>
        <div><Label>Prefix (use "_empty_" for root)</Label><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} />
          GPG sign (otherwise published unsigned)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={skipContents} onChange={(e) => setSkipContents(e.target.checked)} />
          Skip Contents index (faster publish, smaller repo)
        </label>
        <p className="text-xs text-slate-500">
          Contents indexes power <span className="font-mono text-slate-400">apt-file</span>. Skipping
          them makes publishing a large repo much faster and saves space; enable if clients don't need
          file-to-package search.
        </p>
        {sourceKind === "local" && (
          <p className="text-xs text-slate-500">
            Publishing a repo directly serves its current packages. After uploading or
            removing packages, use <span className="text-slate-300">Refresh</span> on the
            publication to update what apt clients see.
          </p>
        )}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-amber-300">
            <RefreshCw size={12} className="animate-spin" />
            Publishing… you can close this dialog; progress shows in the sidebar and on the Published page.
          </p>
        )}
      </div>
    </Modal>
  );
}
