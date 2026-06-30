import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserCircle } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import {
  Button, Card, Input, Label, Badge, PageHeader,
} from "../components/ui";

const ROLE_COLOR: Record<string, string> = { admin: "purple", operator: "blue", viewer: "slate" };

export default function Account() {
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const change = useMutation({
    mutationFn: () => api.post("/auth/change-password", { current_password: current, new_password: next }),
    onSuccess: () => {
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirmPw("");
    },
    onError: (e) => toast.error(apiError(e)),
  });

  function submit() {
    if (next !== confirmPw) {
      toast.error("New password and confirmation do not match");
      return;
    }
    change.mutate();
  }

  return (
    <div>
      <PageHeader title="Account" subtitle="Your profile and security settings" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <UserCircle size={40} className="text-slate-500" />
            <div>
              <p className="text-lg font-semibold text-slate-100">{user?.username}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Role</span>
              {user && <Badge color={ROLE_COLOR[user.role]}>{user.role}</Badge>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <Badge color={user?.is_active ? "green" : "red"}>{user?.is_active ? "active" : "inactive"}</Badge>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-100">Change Password</h2>
          <div className="space-y-4">
            <div><Label>Current Password</Label><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
            <div>
              <Label>New Password</Label>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Must be at least 8 characters with an uppercase, lowercase, and a digit.</p>
            </div>
            <div><Label>Confirm New Password</Label><Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></div>
            <Button loading={change.isPending} onClick={submit} disabled={!current || !next || !confirmPw}>
              Change Password
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
