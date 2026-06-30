import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Trash2, Download, RotateCcw } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Label, Modal, Table, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface Backup {
  name: string;
  size: number;
  created: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function Backups() {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [showRestore, setShowRestore] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => (await api.get<Backup[]>("/backup")).data,
  });

  const create = useMutation({
    mutationFn: () => api.post("/backup", {}),
    onSuccess: () => {
      toast.success("Backup created");
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.delete(`/backup/${name}`),
    onSuccess: () => {
      toast.success("Backup deleted");
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const download = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.get(`/backup/${name}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Backups"
        subtitle="Snapshot and restore the aptly database"
        actions={
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="secondary" onClick={() => setShowRestore(true)}>
                <RotateCcw size={15} /> Restore
              </Button>
            )}
            <Button loading={create.isPending} onClick={() => create.mutate()}>
              <Plus size={15} /> Create Backup
            </Button>
          </div>
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Archive size={32} />} title="No backups yet" hint="Create a backup to capture the current state." />
        ) : (
          <Table head={["Name", "Size", "Created", ""]}>
            {data.map((b) => (
              <tr key={b.name} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-slate-200">{b.name}</td>
                <td className="px-4 py-3 text-slate-400">{formatSize(b.size)}</td>
                <td className="px-4 py-3 text-slate-400">{b.created ? new Date(b.created).toLocaleString() : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" loading={download.isPending && download.variables === b.name}
                      onClick={() => download.mutate(b.name)}>
                      <Download size={13} /> Download
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="ghost"
                        onClick={() => { if (confirm(`Delete backup "${b.name}"?`)) remove.mutate(b.name); }}>
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
      {showRestore && <RestoreBackup onClose={() => setShowRestore(false)} />}
    </div>
  );
}

function RestoreBackup({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);

  const restore = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      return api.post("/backup/restore", fd);
    },
    onSuccess: () => {
      toast.success("Backup restored");
      qc.invalidateQueries({ queryKey: ["backups"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Restore Backup"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={restore.isPending} onClick={() => restore.mutate()} disabled={!file}>
            Restore
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Warning: restoring will overwrite the current aptly database. This is destructive and cannot be undone.
        </p>
        <div>
          <Label>Backup file</Label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200"
          />
        </div>
      </div>
    </Modal>
  );
}
