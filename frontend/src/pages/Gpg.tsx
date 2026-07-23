import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Plus, Trash2, Sparkles } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Modal, Table, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface GpgKey {
  id: string;
  fingerprint: string;
  name: string;
  display: string;
}

export default function Gpg() {
  const qc = useQueryClient();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole("operator");
  const [showImport, setShowImport] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["gpg-keys"],
    queryFn: async () => (await api.get<GpgKey[]>("/gpg/keys")).data,
  });

  const remove = useMutation({
    mutationFn: (fingerprint: string) => api.delete(`/gpg/keys/${fingerprint}`),
    onSuccess: () => {
      toast.success("Key deleted");
      qc.invalidateQueries({ queryKey: ["gpg-keys"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader
        title="GPG Keys"
        subtitle="Signing keys for published repositories"
        actions={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowGenerate(true)}>
                <Sparkles size={15} /> Generate Key
              </Button>
              <Button onClick={() => setShowImport(true)}>
                <Plus size={15} /> Import Key
              </Button>
            </div>
          )
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Key size={32} />} title="No keys yet" hint="Import a GPG key to sign published repositories." />
        ) : (
          <Table head={["ID", "Name", "Fingerprint", ""]}>
            {data.map((k) => (
              <tr key={k.fingerprint} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-slate-300">{k.id}</td>
                <td className="px-4 py-3 text-slate-200">{k.name || k.display}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{k.fingerprint}</td>
                <td className="px-4 py-3">
                  {canEdit && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost"
                        onClick={() => { if (confirm(`Delete key "${k.fingerprint}"?`)) remove.mutate(k.fingerprint); }}>
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
      {showImport && <ImportKey onClose={() => setShowImport(false)} />}
      {showGenerate && <GenerateKey onClose={() => setShowGenerate(false)} />}
    </div>
  );
}

function GenerateKey({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("Aptly Repository");
  const [email, setEmail] = useState("");

  const generate = useMutation({
    mutationFn: () => api.post("/gpg/keys/generate", { name, email, key_length: 4096 }),
    onSuccess: () => {
      toast.success("Signing key generated");
      qc.invalidateQueries({ queryKey: ["gpg-keys"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  return (
    <Modal
      open
      onClose={onClose}
      title="Generate Signing Key"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={generate.isPending} onClick={() => generate.mutate()} disabled={!emailOk}>
            Generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Creates a new 4096-bit RSA key in the signing keyring so you can publish signed
          repositories. Export the public half from the published <span className="font-mono text-slate-300">/gpg</span> path
          for apt clients.
        </p>
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aptly Repository" /></div>
        <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="repo@example.com" /></div>
        {generate.isPending && <p className="text-xs text-slate-500">Generating key — this can take a few seconds…</p>}
      </div>
    </Modal>
  );
}

function ImportKey({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);

  const importKey = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      return api.post("/gpg/keys", fd);
    },
    onSuccess: () => {
      toast.success("Key imported");
      qc.invalidateQueries({ queryKey: ["gpg-keys"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Import GPG Key"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={importKey.isPending} onClick={() => importKey.mutate()} disabled={!file}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Key file (.asc, .gpg, .key)</Label>
          <input
            type="file"
            accept=".asc,.gpg,.key"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200"
          />
        </div>
      </div>
    </Modal>
  );
}
