import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users as UsersIcon, Plus, Trash2, Pencil } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Select, Modal, Table, Badge, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface User {
  id: number;
  username: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
}

const ROLE_COLOR: Record<string, string> = { admin: "purple", operator: "blue", viewer: "slate" };

export default function Users() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage accounts and access roles"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New User
          </Button>
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<UsersIcon size={32} />} title="No users yet" />
        ) : (
          <Table head={["Username", "Email", "Role", "Active", ""]}>
            {data.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium text-slate-200">{u.username}</td>
                <td className="px-4 py-3 text-slate-400">{u.email}</td>
                <td className="px-4 py-3"><Badge color={ROLE_COLOR[u.role]}>{u.role}</Badge></td>
                <td className="px-4 py-3"><Badge color={u.is_active ? "green" : "red"}>{u.is_active ? "active" : "inactive"}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(u)}>
                      <Pencil size={14} className="text-slate-400" />
                    </Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => { if (confirm(`Delete user "${u.username}"?`)) remove.mutate(u.id); }}>
                      <Trash2 size={14} className="text-red-400" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {showCreate && <CreateUser onClose={() => setShowCreate(false)} />}
      {edit && <EditUser user={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CreateUser({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "operator" | "admin">("viewer");
  const [password, setPassword] = useState("");

  const create = useMutation({
    mutationFn: () => api.post("/users", { username, email, role, password }),
    onSuccess: () => {
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Create User"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={() => create.mutate()} disabled={!username || !email || !password}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div><Label>Username</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="viewer">viewer</option>
            <option value="operator">operator</option>
            <option value="admin">admin</option>
          </Select>
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Must be at least 8 characters with an uppercase, lowercase, and a digit.</p>
        </div>
      </div>
    </Modal>
  );
}

function EditUser({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<"viewer" | "operator" | "admin">(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [password, setPassword] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { email, role, is_active: isActive };
      if (password) body.password = password;
      return api.patch(`/users/${user.id}`, body);
    },
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()} disabled={!email}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="viewer">viewer</option>
            <option value="operator">operator</option>
            <option value="admin">admin</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div>
          <Label>New Password (optional)</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current" />
          <p className="mt-1 text-xs text-slate-500">Must be at least 8 characters with an uppercase, lowercase, and a digit.</p>
        </div>
      </div>
    </Modal>
  );
}
