import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, tokens } from "./api";

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
}

const LEVELS: Record<string, number> = { viewer: 1, operator: 2, admin: 3 };

interface AuthCtx {
  user: CurrentUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  hasRole: (min: "viewer" | "operator" | "admin") => boolean;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    if (!tokens.access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<CurrentUser>("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(username: string, password: string) {
    const form = new URLSearchParams({ username, password });
    const { data } = await api.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    tokens.set(data.access_token, data.refresh_token);
    await refreshUser();
  }

  function logout() {
    tokens.clear();
    setUser(null);
  }

  function hasRole(min: "viewer" | "operator" | "admin") {
    return !!user && LEVELS[user.role] >= LEVELS[min];
  }

  return (
    <Ctx.Provider value={{ user, loading, login, logout, refreshUser, hasRole }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
