"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  isAuthenticated: boolean;
  hasRole: (role: User["role"] | User["role"][]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "aptly_token";
const REFRESH_TOKEN_KEY = "aptly_refresh_token";
const USER_KEY = "aptly_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Load user from storage on mount
  useEffect(() => {
    const loadUser = () => {
      const storedUser = localStorage.getItem(USER_KEY);
      const token = localStorage.getItem(TOKEN_KEY);

      if (storedUser && token) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          // Set token in API client
          api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        } catch {
          // Invalid stored data, clear it
          localStorage.removeItem(USER_KEY);
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
      }
      setIsLoading(false);
    };

    loadUser();
  }, []);

  // Token refresh logic - runs after logout is defined
  useEffect(() => {
    const refreshToken = async () => {
      const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refresh) return;

      try {
        const response = await api.post("/auth/refresh", {
          refresh_token: refresh,
        });
        const { access_token } = response.data;
        localStorage.setItem(TOKEN_KEY, access_token);
        api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
      } catch {
        // Refresh failed, clear tokens
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        delete api.defaults.headers.common["Authorization"];
        setUser(null);
      }
    };

    // Refresh every 14 minutes (tokens expire after 15)
    const interval = setInterval(refreshToken, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await api.post("/auth/login", {
          username: email,
          password,
        });

        const { access_token, refresh_token, user: userData } = response.data;

        // Store tokens
        localStorage.setItem(TOKEN_KEY, access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
        localStorage.setItem(USER_KEY, JSON.stringify(userData));

        // Set token in API client
        api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;

        setUser(userData);
        return true;
      } catch (err: unknown) {
        const errorMessage =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data
                ?.detail || "Invalid credentials"
            : "Invalid credentials";
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore errors on logout
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      delete api.defaults.headers.common["Authorization"];
      setUser(null);
      router.push("/login");
    }
  }, [router]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const hasRole = useCallback(
    (role: User["role"] | User["role"][]) => {
      if (!user) return false;
      const roles = Array.isArray(role) ? role : [role];
      // Admin has access to everything
      if (user.role === "admin") return true;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        login,
        logout,
        clearError,
        isAuthenticated: !!user,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Hook for protected routes
export function useRequireAuth(allowedRoles?: User["role"][]) {
  const { isAuthenticated, isLoading, user, hasRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/login");
      } else if (allowedRoles && !hasRole(allowedRoles)) {
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, router, allowedRoles, hasRole]);

  return { isAuthenticated, isLoading, user };
}
