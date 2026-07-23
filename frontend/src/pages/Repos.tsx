import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderGit2, Plus, Trash2, Upload, Package } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Modal, Table, Badge, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface Repo {
  Name: string;
  Comment: string;
  DefaultDistribution: string;
  DefaultComponent: string;
}

export default function Repos() {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole("operator");
  const [showCreate, setShowCreate] = useState(false);
  const [uploadTo, setUploadTo] = useState<string | null>(null);
  const [viewPackages, setViewPackages] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["repos"],
    queryFn: async () => (await api.get<Repo[]>("/repos")).data,
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.delete(`/repos/${name}`, { params: { force: true } }),
    onSuccess: () => {
      toast.success("Repo deleted");
      qc.invalidateQueries({ queryKey: ["repos"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Local Repos"
        subtitle="Manage local package repositories"
        actions={
          canEdit && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New Repo
            </Button>
          )
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<FolderGit2 size={32} />} title="No repos yet" hint="Create a local repo to host your own packages." />
        ) : (
          <Table head={["Name", "Comment", "Distribution", "Component", ""]}>
            {data.map((r) => (
              <tr key={r.Name} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-slate-200">{r.Name}</td>
                <td className="px-4 py-3 text-slate-400">{r.Comment}</td>
                <td className="px-4 py-3">{r.DefaultDistribution ? <Badge color="blue">{r.DefaultDistribution}</Badge> : <span className="text-slate-500">—</span>}</td>
                <td className="px-4 py-3 text-slate-400">{r.DefaultComponent}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setViewPackages(r.Name)}>
                      <Package size={13} /> Packages
                    </Button>
                    {canEdit && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setUploadTo(r.Name)}>
                          <Upload size={13} /> Upload .deb
                        </Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => { if (confirm(`Delete repo "${r.Name}"?`)) remove.mutate(r.Name); }}>
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
      {showCreate && <CreateRepo onClose={() => setShowCreate(false)} />}
      {uploadTo && <UploadDeb repo={uploadTo} onClose={() => setUploadTo(null)} />}
      {viewPackages && <ViewPackages repo={viewPackages} canEdit={canEdit} onClose={() => setViewPackages(null)} />}
    </div>
  );
}

function CreateRepo({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [dist, setDist] = useState("");
  const [comp, setComp] = useState("main");

  const create = useMutation({
    mutationFn: () =>
      api.post("/repos", {
        Name: name,
        Comment: comment,
        DefaultDistribution: dist,
        DefaultComponent: comp,
      }),
    onSuccess: () => {
      toast.success("Repo created");
      qc.invalidateQueries({ queryKey: ["repos"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Create Repo"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={() => create.mutate()} disabled={!name}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-repo" /></div>
        <div><Label>Comment</Label><Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Description" /></div>
        <div><Label>Default Distribution</Label><Input value={dist} onChange={(e) => setDist(e.target.value)} placeholder="bookworm" /></div>
        <div><Label>Default Component</Label><Input value={comp} onChange={(e) => setComp(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function UploadDeb({ repo, onClose }: { repo: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [files, setFiles] = useState<FileList | null>(null);
  const [forceReplace, setForceReplace] = useState(false);

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (files) Array.from(files).forEach((f) => fd.append("files", f));
      fd.append("force_replace", forceReplace ? "true" : "false");
      return api.post(`/repos/${repo}/upload`, fd);
    },
    onSuccess: () => {
      toast.success("Packages uploaded");
      qc.invalidateQueries({ queryKey: ["repos"] });
      qc.invalidateQueries({ queryKey: ["repo-packages", repo] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Upload .deb to ${repo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={upload.isPending} onClick={() => upload.mutate()} disabled={!files || files.length === 0}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Files (.deb)</Label>
          <input
            type="file"
            multiple
            accept=".deb"
            onChange={(e) => setFiles(e.target.files)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={forceReplace} onChange={(e) => setForceReplace(e.target.checked)} />
          Force replace existing packages
        </label>
      </div>
    </Modal>
  );
}

// Package keys look like "Pamd64 name version hash"; show a readable label.
function packageLabel(key: string): string {
  const parts = key.split(/\s+/);
  if (parts.length >= 3 && parts[0].startsWith("P")) {
    return `${parts[1]} ${parts[2]} (${parts[0].slice(1)})`;
  }
  return key;
}

function ViewPackages({ repo, canEdit, onClose }: { repo: string; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["repo-packages", repo],
    queryFn: async () => (await api.get<string[]>(`/repos/${repo}/packages`)).data,
  });

  const remove = useMutation({
    mutationFn: (ref: string) =>
      api.delete(`/repos/${repo}/packages`, { data: { PackageRefs: [ref] } }),
    onSuccess: () => {
      toast.success("Package removed");
      qc.invalidateQueries({ queryKey: ["repo-packages", repo] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const filtered = (data || []).filter((p) => p.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Modal open onClose={onClose} title={`Packages in ${repo}`}>
      <div className="space-y-3">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter packages…" />
        {isLoading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Package size={28} />} title="No packages" />
        ) : (
          <>
            <p className="text-xs text-slate-500">{filtered.length} package(s)</p>
            {canEdit && (
              <p className="text-xs text-slate-500">
                Removing a package takes effect after re-snapshotting and re-publishing.
              </p>
            )}
            <ul className="space-y-1 font-mono text-xs text-slate-300">
              {filtered.map((p) => (
                <li key={p} className="flex items-center justify-between gap-2 rounded bg-slate-950 px-2 py-1">
                  <span className="truncate" title={p}>{packageLabel(p)}</span>
                  {canEdit && (
                    <Button size="sm" variant="ghost"
                      loading={remove.isPending && remove.variables === p}
                      onClick={() => { if (confirm(`Remove ${packageLabel(p)} from ${repo}?`)) remove.mutate(p); }}>
                      <Trash2 size={13} className="text-red-400" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
