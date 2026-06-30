import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Mirrors from "./pages/Mirrors";
import Repos from "./pages/Repos";
import Snapshots from "./pages/Snapshots";
import Publish from "./pages/Publish";
import Packages from "./pages/Packages";
import Gpg from "./pages/Gpg";
import Schedules from "./pages/Schedules";
import Backups from "./pages/Backups";
import Users from "./pages/Users";
import Audit from "./pages/Audit";
import Account from "./pages/Account";

function Protected({ children, role }: { children: JSX.Element; role?: "viewer" | "operator" | "admin" }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role && !hasRole(role)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/mirrors" element={<Protected><Mirrors /></Protected>} />
      <Route path="/repos" element={<Protected><Repos /></Protected>} />
      <Route path="/snapshots" element={<Protected><Snapshots /></Protected>} />
      <Route path="/publish" element={<Protected><Publish /></Protected>} />
      <Route path="/packages" element={<Protected><Packages /></Protected>} />
      <Route path="/gpg" element={<Protected><Gpg /></Protected>} />
      <Route path="/schedules" element={<Protected><Schedules /></Protected>} />
      <Route path="/backups" element={<Protected role="operator"><Backups /></Protected>} />
      <Route path="/users" element={<Protected role="admin"><Users /></Protected>} />
      <Route path="/audit" element={<Protected role="admin"><Audit /></Protected>} />
      <Route path="/account" element={<Protected><Account /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
