import axios from "axios";

const ACCESS_KEY = "aptly_access";
const REFRESH_KEY = "aptly_refresh";

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const t = tokens.access;
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = tokens.refresh;
  if (!refresh) return null;
  try {
    const { data } = await axios.post("/api/auth/refresh", { refresh_token: refresh });
    tokens.set(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    tokens.clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (tokens.refresh) {
        original._retry = true;
        refreshing = refreshing || doRefresh();
        const newToken = await refreshing;
        refreshing = null;
        if (newToken) {
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      }
      // Refresh failed or no refresh token — bounce to login (but never while
      // on the login page itself, where a 401 just means bad credentials).
      if (window.location.pathname !== "/login") {
        tokens.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function apiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    let detail = (e.response?.data as any)?.detail;
    // FastAPI validation errors return detail as an array of objects; anything
    // non-string must be flattened or React will refuse to render the toast.
    if (Array.isArray(detail)) {
      detail = detail.map((d: any) => d?.msg || JSON.stringify(d)).join("; ");
    } else if (detail && typeof detail !== "string") {
      detail = JSON.stringify(detail);
    }
    return detail || e.message || "Request failed";
  }
  return e instanceof Error ? e.message : "Unexpected error";
}
