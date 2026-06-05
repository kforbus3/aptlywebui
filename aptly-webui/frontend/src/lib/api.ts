import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem("refreshToken");

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token } = response.data;
          localStorage.setItem("accessToken", access_token);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

// Types
interface MirrorCreate {
  Name: string;
  ArchiveURL: string;
  Distribution: string;
  Components?: string[];
  Architectures?: string[];
  Sources?: boolean;
  Filter?: string;
  FilterWithDeps?: boolean;
  DownloadUris?: boolean;
  SkipComponentCheck?: boolean;
  Keyrings?: string[];
}

interface SnapshotCreate {
  Name: string;
  Description?: string;
  SourceSnapshots?: Array<{
    Component: string;
    Name: string;
  }>;
}

interface RepoCreate {
  name: string;
  comment?: string;
  default_distribution?: string;
  default_component?: string;
}

interface PublishCreate {
  SourceKind: "snapshot" | "local";
  Sources: Array<{
    Component: string;
    Name: string;
  }>;
  Distribution: string;
  Label?: string;
  Origin?: string;
  ForceOverwrite?: boolean;
  GpgKey?: string;
  Skip?: boolean;
  Batch?: boolean;
  Keyring?: string;
}

interface PublishSwitch {
  Snapshots: Array<{
    Component: string;
    Name: string;
  }>;
  ForceOverwrite?: boolean;
}

// API functions
export const mirrors = {
  list: () => api.get("/mirrors"),
  get: (name: string) => api.get(`/mirrors/${name}`),
  create: (data: MirrorCreate) => api.post("/mirrors", data),
  update: (name: string, data: Partial<MirrorCreate>) => api.put(`/mirrors/${name}`, data),
  delete: (name: string, force?: boolean) =>
    api.delete(`/mirrors/${name}`, { params: { force } }),
  updatePackages: (name: string, data?: { force?: boolean }) =>
    api.post(`/mirrors/${name}/update`, data),
  getPackages: (name: string) => api.get(`/mirrors/${name}/packages`),
};

export const snapshots = {
  list: () => api.get("/snapshots"),
  get: (name: string) => api.get(`/snapshots/${name}`),
  create: (data: SnapshotCreate) => api.post("/snapshots", data),
  createFromMirror: (mirrorName: string, data: { name: string; description?: string }) =>
    api.post(`/snapshots/from-mirror/${mirrorName}`, data),
  createFromRepo: (repoName: string, data: { name: string; description?: string }) =>
    api.post(`/snapshots/from-repo/${repoName}`, data),
  delete: (name: string, force?: boolean) =>
    api.delete(`/snapshots/${name}`, { params: { force } }),
  diff: (name: string, other: string) =>
    api.get(`/snapshots/${name}/diff/${other}`),
  getPackages: (name: string) => api.get(`/snapshots/${name}/packages`),
};

export const repos = {
  list: () => api.get("/repos"),
  create: (data: RepoCreate) => api.post("/repos", data),
  delete: (name: string) => api.delete(`/repos/${name}`),
  getPackages: (name: string) => api.get(`/repos/${name}/packages`),
};

export const publish = {
  list: () => api.get("/publish"),
  publishSnapshot: (prefix: string, data: PublishCreate) =>
    api.post(`/publish/${prefix}`, data),
  switch: (prefix: string, distribution: string, data: PublishSwitch) =>
    api.put(`/publish/${prefix}/${distribution}`, data),
  update: (prefix: string, distribution: string, data: { signing?: Record<string, unknown>; force_overwrite?: boolean }) =>
    api.patch(`/publish/${prefix}/${distribution}`, data),
  delete: (prefix: string, distribution: string, force?: boolean) =>
    api.delete(`/publish/${prefix}/${distribution}`, { params: { force } }),
};

export const gpg = {
  listKeys: () => api.get("/gpg/keys"),
  importKey: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/gpg/keys", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteKey: (fingerprint: string) =>
    api.delete(`/gpg/keys/${fingerprint}`),
};

export const tasks = {
  list: () => api.get("/tasks"),
  get: (id: string) => api.get(`/tasks/${id}`),
};

export const auth = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  register: (data: { email: string; password: string; full_name?: string }) =>
    api.post("/auth/register", data),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refresh_token: refreshToken }),
  me: () => api.get("/auth/me"),
};
