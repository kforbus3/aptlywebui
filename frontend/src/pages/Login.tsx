import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Boxes } from "lucide-react";
import { useAuth } from "../lib/auth";
import { apiError } from "../lib/api";
import { Button, Card, Input, Label } from "../components/ui";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as any)?.from?.pathname || "/";
  // Already authenticated: redirect declaratively instead of calling navigate()
  // during render (which warns and races the post-submit navigate).
  if (user) return <Navigate to={from} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Boxes className="text-brand-400" size={32} />
          <h1 className="text-lg font-semibold">Aptly Web UI</h1>
          <p className="text-xs text-slate-500">Sign in to manage your repositories</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
