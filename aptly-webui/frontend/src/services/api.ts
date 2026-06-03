import axios, { AxiosError } from 'axios'
import toast from 'react-hot-toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const data = error.response?.data as { error?: string } | undefined
    const message = data?.error || error.message || 'Unknown error'
    toast.error(`Error: ${message}`)
    return Promise.reject(error)
  }
)

// ============================================================================
// Types
// ============================================================================

export interface Mirror {
  name: string
  archive_root: string
  distribution: string
  components: string[]
  architectures?: string[]
  last_updated?: string
  num_packages: number
  download_size?: string
  filter?: string
  filter_with_deps?: boolean
  skip_component_check?: boolean
  is_esm?: boolean
}

export interface Snapshot {
  name: string
  created_at: string
  description: string
  num_packages: number
  sources?: { Name: string; Component: string }[]
}

export interface PublishedRepo {
  storage?: string
  prefix: string
  distribution: string
  source_kind?: string
  sources: { Name: string; Component: string }[]
  architectures?: string[]
  label?: string
  origin?: string
  acquire_by_hash?: boolean
  signing_options?: Record<string, unknown>
}

export interface Package {
  key: string
  name: string
  version: string
  architecture: string
}

export interface PackageSearchResult {
  location: string
  type: 'snapshot' | 'published'
  name?: string
  prefix?: string
  distribution?: string
  package: string
}

export interface PackageSearchResponse {
  results: PackageSearchResult[]
  total: number
  note?: string
  error?: string
}

export interface CreateMirrorRequest {
  name: string
  archive_url: string
  distribution: string
  components?: string[]
  architectures?: string[]
  filter?: string
  filter_with_deps?: boolean
  with_installer?: boolean
  with_udebs?: boolean
  skip_component_check?: boolean
  is_esm?: boolean
}

export interface CreateSnapshotRequest {
  name: string
  description?: string
  from_mirror?: string
  from_snapshots?: string[]
  from_empty?: boolean
  latest?: boolean
}

export interface PublishSnapshotRequest {
  snapshot: string
  distribution: string
  prefix?: string
  component?: string
  architectures?: string[]
  label?: string
  origin?: string
  gpg_key?: string
  gpg_skip?: boolean
  passphrase_file?: string
  notautomatic?: boolean
  butautomaticupgrades?: boolean
  acquire_by_hash?: boolean
  skip_contents?: boolean
  skip_bz2?: boolean
  force_overwrite?: boolean
}

// ============================================================================
// API Functions - Mirrors
// ============================================================================

export const getMirrors = async (): Promise<Mirror[]> => {
  const response = await api.get('/mirrors')
  return response.data.mirrors
}

export const getMirror = async (name: string): Promise<Mirror> => {
  const response = await api.get(`/mirrors/${encodeURIComponent(name)}`)
  return response.data.mirror
}

export const createMirror = async (data: CreateMirrorRequest): Promise<void> => {
  await api.post('/mirrors', data)
}

export const deleteMirror = async (name: string, force = false): Promise<void> => {
  await api.delete(`/mirrors/${encodeURIComponent(name)}?force=${force}`)
}

export const updateMirror = async (name: string, options?: {
  ignore_checksums?: boolean
  ignore_signatures?: boolean
  download_limit?: number
}): Promise<void> => {
  await api.post(`/mirrors/${encodeURIComponent(name)}/update`, options || {})
}

export const getMirrorPackages = async (
  name: string,
  page = 1,
  perPage = 50,
  query = ''
): Promise<{ packages: Package[]; total: number; pages: number }> => {
  const response = await api.get(
    `/mirrors/${encodeURIComponent(name)}/packages?page=${page}&per_page=${perPage}&query=${encodeURIComponent(query)}`
  )
  return response.data
}

// ============================================================================
// API Functions - Snapshots
// ============================================================================

export const getSnapshots = async (): Promise<Snapshot[]> => {
  const response = await api.get('/snapshots')
  return response.data.snapshots
}

export const getSnapshot = async (name: string): Promise<Snapshot> => {
  const response = await api.get(`/snapshots/${encodeURIComponent(name)}`)
  return response.data.snapshot
}

export const createSnapshot = async (data: CreateSnapshotRequest): Promise<void> => {
  await api.post('/snapshots', data)
}

export const deleteSnapshot = async (name: string, force = false): Promise<void> => {
  await api.delete(`/snapshots/${encodeURIComponent(name)}?force=${force}`)
}

export const getSnapshotPackages = async (
  name: string,
  page = 1,
  perPage = 50,
  query = ''
): Promise<{ packages: Package[]; total: number; pages: number }> => {
  const response = await api.get(
    `/snapshots/${encodeURIComponent(name)}/packages?page=${page}&per_page=${perPage}&query=${encodeURIComponent(query)}`
  )
  return response.data
}

export const diffSnapshots = async (name1: string, name2: string): Promise<unknown> => {
  const response = await api.get(`/snapshots/${encodeURIComponent(name1)}/diff/${encodeURIComponent(name2)}`)
  return response.data.diff
}

// ============================================================================
// API Functions - Published Repos
// ============================================================================

export const getPublished = async (): Promise<PublishedRepo[]> => {
  const response = await api.get('/publish')
  return response.data.published
}

export const getPublishedDetails = async (prefix: string, distribution: string): Promise<PublishedRepo> => {
  const response = await api.get(`/publish/${encodeURIComponent(prefix || 'root')}/${encodeURIComponent(distribution)}`)
  return response.data.published
}

export const publishSnapshot = async (data: PublishSnapshotRequest): Promise<void> => {
  await api.post('/publish', data)
}

export const switchPublished = async (
  prefix: string,
  distribution: string,
  snapshot: string,
  options?: { gpg_key?: string; gpg_skip?: boolean; force_overwrite?: boolean }
): Promise<void> => {
  await api.post(`/publish/${encodeURIComponent(prefix || 'root')}?distribution=${encodeURIComponent(distribution)}`, {
    snapshot,
    ...options
  })
}

export const dropPublished = async (prefix: string, distribution: string, force = false): Promise<void> => {
  await api.delete(`/publish/${encodeURIComponent(prefix || 'root')}/${encodeURIComponent(distribution)}?force=${force}`)
}

// ============================================================================
// API Functions - Packages
// ============================================================================

export const searchPackages = async (
  query: string,
  options?: { in_published?: boolean; in_snapshots?: boolean }
): Promise<PackageSearchResponse> => {
  const params = new URLSearchParams({ q: query })
  if (options?.in_published) params.append('published', 'true')
  if (options?.in_snapshots !== false) params.append('snapshots', 'true')

  const response = await api.get(`/packages/search?${params.toString()}`)
  return response.data
}

export const showPackage = async (packageKey: string): Promise<unknown> => {
  const response = await api.get(`/packages/show/${encodeURIComponent(packageKey)}`)
  return response.data.package
}

// ============================================================================
// API Functions - System
// ============================================================================

export const getConfig = async (): Promise<unknown> => {
  const response = await api.get('/config')
  return response.data.config
}

export const dbCleanup = async (dryRun = true): Promise<{ output: string }> => {
  const response = await api.post(`/db/cleanup?dry-run=${dryRun}`)
  return response.data
}

export const dbRecover = async (): Promise<{ output: string }> => {
  const response = await api.post('/db/recover')
  return response.data
}

export const getGraph = async (): Promise<unknown> => {
  const response = await api.get('/graph')
  return response.data.graph
}

export const healthCheck = async (): Promise<{ status: string; aptly_available: boolean }> => {
  const response = await api.get('/health')
  return response.data
}

export const getStats = async (): Promise<{ stats: { total_mirrors: number; total_snapshots: number; total_published: number; total_packages: number; updated_at: string }; cache_enabled: boolean }> => {
  const response = await api.get('/stats')
  return response.data
}

// ============================================================================
// API Functions - ESM
// ============================================================================

export const getEsmStatus = async (): Promise<{ esm_configured: boolean; message: string }> => {
  const response = await api.get('/esm/status')
  return response.data
}

export const getEsmMirrors = async (): Promise<Mirror[]> => {
  const response = await api.get('/esm/mirrors')
  return response.data.esm_mirrors
}

export default api
