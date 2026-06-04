import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  Package,
  ExternalLink,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getMirrors,
  getMirrorPackages,
  createMirror,
  deleteMirror,
  updateMirror,
  type Mirror,
  type Package as PackageType
} from '../services/api'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'

function Mirrors() {
  const queryClient = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedMirror, setSelectedMirror] = useState<Mirror | null>(null)
  const [packagesModalOpen, setPackagesModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [mirrorToDelete, setMirrorToDelete] = useState<Mirror | null>(null)
  const [forceDelete, setForceDelete] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    archive_url: '',
    distribution: '',
    components: ['main'],
    architectures: ['amd64'],
    filter: '',
    filter_with_deps: false,
    skip_component_check: false,
    is_esm: false,
    esm_token: ''
  })

  const { data: mirrors, isLoading } = useQuery({
    queryKey: ['mirrors'],
    queryFn: getMirrors
  })

  const createMutation = useMutation({
    mutationFn: createMirror,
    onSuccess: () => {
      toast.success('Mirror created successfully')
      queryClient.invalidateQueries({ queryKey: ['mirrors'] })
      setCreateModalOpen(false)
      resetForm()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: ({ name, force }: { name: string; force: boolean }) =>
      deleteMirror(name, force),
    onSuccess: () => {
      toast.success('Mirror deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['mirrors'] })
      setDeleteModalOpen(false)
      setMirrorToDelete(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const updateMutation = useMutation({
    mutationFn: (name: string) => updateMirror(name),
    onSuccess: () => {
      toast.success('Mirror update started')
      queryClient.invalidateQueries({ queryKey: ['mirrors'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const resetForm = () => {
    setFormData({
      name: '',
      archive_url: '',
      distribution: '',
      components: ['main'],
      architectures: ['amd64'],
      filter: '',
      filter_with_deps: false,
      skip_component_check: false,
      is_esm: false,
      esm_token: ''
    })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  const handleDelete = () => {
    if (mirrorToDelete) {
      deleteMutation.mutate({ name: mirrorToDelete.name, force: forceDelete })
    }
  }

  const toggleRow = (name: string) => {
    const newSet = new Set(expandedRows)
    if (newSet.has(name)) {
      newSet.delete(name)
    } else {
      newSet.add(name)
    }
    setExpandedRows(newSet)
  }

  const filteredMirrors = mirrors?.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.distribution.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.archive_root?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Mirrors</h1>
        <p>Manage your Aptly mirrors from external repositories</p>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus size={18} />
            Create Mirror
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <div style={{ position: 'relative' }}>
            <Filter size={18} style={{ position: 'absolute', left: 'var(--space-md)', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search mirrors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
        </div>
      </div>

      {/* Mirrors Table */}
      <div className="card">
        {isLoading ? (
          <div className="loading-container">
            <div className="spinner" style={{ width: '40px', height: '40px' }} />
            <p>Loading mirrors...</p>
          </div>
        ) : filteredMirrors?.length === 0 ? (
          <div className="empty-state">
            <Database size={48} className="empty-state-icon" />
            <h3>No Mirrors Found</h3>
            <p>Create your first mirror to start syncing packages from external repositories.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Distribution</th>
                  <th>Components</th>
                  <th>Arch</th>
                  <th>Packages</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMirrors?.map((mirror) => (
                  <>
                    <tr key={mirror.name}>
                      <td>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => toggleRow(mirror.name)}
                          style={{ marginRight: 'var(--space-sm)' }}
                        >
                          {expandedRows.has(mirror.name) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <strong>{mirror.name}</strong>
                        {mirror.is_esm && (
                          <span className="badge badge-info" style={{ marginLeft: 'var(--space-sm)' }}>ESM</span>
                        )}
                      </td>
                      <td>{mirror.distribution}</td>
                      <td>{mirror.components?.join(', ')}</td>
                      <td>{mirror.architectures?.slice(0, 2).join(', ')}{mirror.architectures && mirror.architectures.length > 2 ? '...' : ''}</td>
                      <td>{mirror.num_packages != null ? mirror.num_packages.toLocaleString() : 'N/A'}</td>
                      <td>{mirror.last_updated ? new Date(mirror.last_updated).toLocaleString() : 'Never'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => updateMutation.mutate(mirror.name)}
                            disabled={updateMutation.isPending}
                            title="Update mirror"
                          >
                            {updateMutation.isPending ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setSelectedMirror(mirror)
                              setPackagesModalOpen(true)
                            }}
                            title="View packages"
                          >
                            <Package size={14} />
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              setMirrorToDelete(mirror)
                              setDeleteModalOpen(true)
                            }}
                            title="Delete mirror"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRows.has(mirror.name) && (
                      <tr className="expanded-row">
                        <td colSpan={7} style={{ backgroundColor: 'var(--bg-tertiary)', padding: 'var(--space-lg)' }}>
                          <div style={{ display: 'grid', gap: 'var(--space-sm)', fontSize: 'var(--text-sm)' }}>
                            <div><strong>Archive Root:</strong> {mirror.archive_root}</div>
                            <div><strong>Download Size:</strong> {mirror.download_size || 'N/A'}</div>
                            {mirror.filter && <div><strong>Filter:</strong> <code>{mirror.filter}</code></div>}
                            {mirror.filter_with_deps && <div><strong>Filter with deps:</strong> Yes</div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Mirror Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Mirror"
        size="large"
      >
        <form onSubmit={handleCreate}>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div className="form-group">
              <label className="label">Mirror Name *</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., debian-bookworm"
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Distribution *</label>
              <input
                type="text"
                className="input"
                value={formData.distribution}
                onChange={(e) => setFormData({ ...formData, distribution: e.target.value })}
                placeholder="e.g., bookworm"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Archive URL *</label>
            <input
              type="url"
              className="input"
              value={formData.archive_url}
              onChange={(e) => setFormData({ ...formData, archive_url: e.target.value })}
              placeholder="e.g., http://deb.debian.org/debian"
              required
            />
          </div>

          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div className="form-group">
              <label className="label">Components</label>
              <input
                type="text"
                className="input"
                value={formData.components.join(', ')}
                onChange={(e) => setFormData({ ...formData, components: e.target.value.split(',').map(s => s.trim()) })}
                placeholder="main, contrib, non-free"
              />
            </div>
            <div className="form-group">
              <label className="label">Architectures</label>
              <input
                type="text"
                className="input"
                value={formData.architectures.join(', ')}
                onChange={(e) => setFormData({ ...formData, architectures: e.target.value.split(',').map(s => s.trim()) })}
                placeholder="amd64, arm64"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Package Filter (optional)</label>
            <input
              type="text"
              className="input"
              value={formData.filter}
              onChange={(e) => setFormData({ ...formData, filter: e.target.value })}
              placeholder="e.g., nginx | apache"
            />
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.filter_with_deps}
                onChange={(e) => setFormData({ ...formData, filter_with_deps: e.target.checked })}
              />
              <span>Include dependencies when filtering</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.skip_component_check}
                onChange={(e) => setFormData({ ...formData, skip_component_check: e.target.checked })}
              />
              <span>Skip component check (force components)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.is_esm}
                onChange={(e) => setFormData({ ...formData, is_esm: e.target.checked })}
              />
              <span>Ubuntu ESM Repository (requires ESM token)</span>
            </label>
          </div>

          {formData.is_esm && (
            <div className="form-group">
              <label className="label">ESM Token *</label>
              <input
                type="password"
                className="input"
                value={formData.esm_token}
                onChange={(e) => setFormData({ ...formData, esm_token: e.target.value })}
                placeholder="Enter your Ubuntu Pro/ESM token"
                required={formData.is_esm}
              />
              <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: 'var(--space-xs)' }}>
                Token is stored encrypted and used for ESM authentication.
                <a href="https://ubuntu.com/pro" target="_blank" rel="noopener">Get Ubuntu Pro token</a>
              </small>
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Mirror'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Mirror Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Mirror"
      >
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <p>Are you sure you want to delete the mirror <strong>{mirrorToDelete?.name}</strong>?</p>
          <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-error)' }}>
            This action cannot be undone.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={forceDelete}
              onChange={(e) => setForceDelete(e.target.checked)}
            />
            <span>Force delete (ignore dependencies)</span>
          </label>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => setDeleteModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>

      {/* Packages Modal */}
      {selectedMirror && (
        <MirrorPackagesModal
          isOpen={packagesModalOpen}
          onClose={() => {
            setPackagesModalOpen(false)
            setSelectedMirror(null)
          }}
          mirror={selectedMirror}
        />
      )}
    </div>
  )
}

// Mirror Packages Modal Component
function MirrorPackagesModal({ isOpen, onClose, mirror }: {
  isOpen: boolean
  onClose: () => void
  mirror: Mirror
}) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const perPage = 20

  const { data, isLoading } = useQuery({
    queryKey: ['mirror-packages', mirror.name, page, query],
    queryFn: () => getMirrorPackages(mirror.name, page, perPage, query),
    enabled: isOpen
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Packages in ${mirror.name}`}
      size="large"
    >
      <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
        <input
          type="text"
          className="input"
          placeholder="Search packages..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {isLoading ? (
        <div className="loading-container" style={{ minHeight: '200px' }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Architecture</th>
                </tr>
              </thead>
              <tbody>
                {data?.packages.map((pkg: PackageType) => (
                  <tr key={pkg.key}>
                    <td>{pkg.name}</td>
                    <td><code style={{ fontSize: 'var(--text-xs)' }}>{pkg.version}</code></td>
                    <td><span className="badge badge-info">{pkg.architecture}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && (
            <Pagination
              page={page}
              pages={data.pages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </Modal>
  )
}

export default Mirrors
