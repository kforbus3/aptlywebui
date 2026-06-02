import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  Plus,
  Trash2,
  Package,
  GitCompare,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Merge,
  Calendar
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getSnapshots,
  getMirrors,
  createSnapshot,
  deleteSnapshot,
  getSnapshotPackages,
  diffSnapshots,
  type Snapshot,
  type Mirror
} from '../services/api'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'

function Snapshots() {
  const queryClient = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null)
  const [packagesModalOpen, setPackagesModalOpen] = useState(false)
  const [diffModalOpen, setDiffModalOpen] = useState(false)
  const [snapshotToCompare, setSnapshotToCompare] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [snapshotToDelete, setSnapshotToDelete] = useState<Snapshot | null>(null)
  const [forceDelete, setForceDelete] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // Form state
  const [formData, setFormData] = useState<{
    name: string
    description: string
    sourceType: 'mirror' | 'snapshots' | 'empty'
    fromMirror: string
    fromSnapshots: string[]
    latest: boolean
  }>({
    name: '',
    description: '',
    sourceType: 'mirror',
    fromMirror: '',
    fromSnapshots: [],
    latest: false
  })

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots
  })

  const { data: mirrors } = useQuery({
    queryKey: ['mirrors'],
    queryFn: getMirrors
  })

  const createMutation = useMutation({
    mutationFn: createSnapshot,
    onSuccess: () => {
      toast.success('Snapshot created successfully')
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      setCreateModalOpen(false)
      resetForm()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: ({ name, force }: { name: string; force: boolean }) =>
      deleteSnapshot(name, force),
    onSuccess: () => {
      toast.success('Snapshot deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      setDeleteModalOpen(false)
      setSnapshotToDelete(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      sourceType: 'mirror',
      fromMirror: '',
      fromSnapshots: [],
      latest: false
    })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: any = {
      name: formData.name,
      description: formData.description
    }

    if (formData.sourceType === 'mirror') {
      payload.from_mirror = formData.fromMirror
    } else if (formData.sourceType === 'snapshots') {
      payload.from_snapshots = formData.fromSnapshots
      payload.latest = formData.latest
    } else {
      payload.from_empty = true
    }

    createMutation.mutate(payload)
  }

  const handleDelete = () => {
    if (snapshotToDelete) {
      deleteMutation.mutate({ name: snapshotToDelete.name, force: forceDelete })
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

  const filteredSnapshots = snapshots?.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Snapshots</h1>
        <p>Create and manage snapshots of your mirrors</p>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus size={18} />
            Create Snapshot
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            type="text"
            className="input"
            placeholder="Search snapshots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Snapshots Table */}
      <div className="card">
        {isLoading ? (
          <div className="loading-container">
            <div className="spinner" style={{ width: '40px', height: '40px' }} />
            <p>Loading snapshots...</p>
          </div>
        ) : filteredSnapshots?.length === 0 ? (
          <div className="empty-state">
            <Camera size={48} className="empty-state-icon" />
            <h3>No Snapshots Found</h3>
            <p>Create a snapshot to freeze the current state of a mirror.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Packages</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSnapshots?.map((snapshot) => (
                  <>
                    <tr key={snapshot.name}>
                      <td>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => toggleRow(snapshot.name)}
                          style={{ marginRight: 'var(--space-sm)' }}
                        >
                          {expandedRows.has(snapshot.name) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <strong>{snapshot.name}</strong>
                      </td>
                      <td>{snapshot.description}</td>
                      <td>{snapshot.num_packages.toLocaleString()}</td>
                      <td>{snapshot.created_at ? new Date(snapshot.created_at).toLocaleString() : 'N/A'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setSelectedSnapshot(snapshot)
                              setPackagesModalOpen(true)
                            }}
                            title="View packages"
                          >
                            <Package size={14} />
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setSelectedSnapshot(snapshot)
                              setDiffModalOpen(true)
                            }}
                            title="Compare with another snapshot"
                          >
                            <GitCompare size={14} />
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              setSnapshotToDelete(snapshot)
                              setDeleteModalOpen(true)
                            }}
                            title="Delete snapshot"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRows.has(snapshot.name) && snapshot.sources && (
                      <tr className="expanded-row">
                        <td colSpan={5} style={{ backgroundColor: 'var(--bg-tertiary)', padding: 'var(--space-lg)' }}>
                          <div style={{ fontSize: 'var(--text-sm)' }}>
                            <strong>Sources:</strong>
                            <ul style={{ marginTop: 'var(--space-sm)', marginLeft: 'var(--space-lg)' }}>
                              {snapshot.sources.map((source, idx) => (
                                <li key={idx}>{source.Name} {source.Component && `(component: ${source.Component})`}</li>
                              ))}
                            </ul>
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

      {/* Create Snapshot Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Snapshot"
        size="large"
      >
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="label">Snapshot Name *</label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., debian-bookworm-2024-01"
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Description</label>
            <input
              type="text"
              className="input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Debian Bookworm snapshot from January 2024"
            />
          </div>

          <div className="form-group">
            <label className="label">Source Type</label>
            <select
              className="input select"
              value={formData.sourceType}
              onChange={(e) => setFormData({ ...formData, sourceType: e.target.value as any })}
            >
              <option value="mirror">From Mirror</option>
              <option value="snapshots">Merge Snapshots</option>
              <option value="empty">Empty Snapshot</option>
            </select>
          </div>

          {formData.sourceType === 'mirror' && (
            <div className="form-group">
              <label className="label">Select Mirror *</label>
              <select
                className="input select"
                value={formData.fromMirror}
                onChange={(e) => setFormData({ ...formData, fromMirror: e.target.value })}
                required={formData.sourceType === 'mirror'}
              >
                <option value="">Choose a mirror...</option>
                {mirrors?.map((mirror) => (
                  <option key={mirror.name} value={mirror.name}>
                    {mirror.name} ({mirror.distribution})
                  </option>
                ))}
              </select>
            </div>
          )}

          {formData.sourceType === 'snapshots' && (
            <>
              <div className="form-group">
                <label className="label">Select Snapshots to Merge *</label>
                <select
                  className="input select"
                  multiple
                  size={5}
                  value={formData.fromSnapshots}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map(o => o.value)
                    setFormData({ ...formData, fromSnapshots: selected })
                  }}
                >
                  {snapshots?.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.num_packages} packages)
                    </option>
                  ))}
                </select>
                <small style={{ color: 'var(--text-tertiary)' }}>Hold Ctrl/Cmd to select multiple</small>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.latest}
                    onChange={(e) => setFormData({ ...formData, latest: e.target.checked })}
                  />
                  <span>Use only the latest version of each package</span>
                </label>
              </div>
            </>
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
              {createMutation.isPending ? 'Creating...' : 'Create Snapshot'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Snapshot"
      >
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <p>Are you sure you want to delete the snapshot <strong>{snapshotToDelete?.name}</strong>?</p>
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
      {selectedSnapshot && (
        <SnapshotPackagesModal
          isOpen={packagesModalOpen}
          onClose={() => {
            setPackagesModalOpen(false)
            setSelectedSnapshot(null)
          }}
          snapshot={selectedSnapshot}
        />
      )}

      {/* Diff Modal */}
      {selectedSnapshot && (
        <DiffModal
          isOpen={diffModalOpen}
          onClose={() => {
            setDiffModalOpen(false)
            setSnapshotToCompare('')
            setSelectedSnapshot(null)
          }}
          snapshot1={selectedSnapshot.name}
          snapshots={snapshots?.filter(s => s.name !== selectedSnapshot.name) || []}
        />
      )}
    </div>
  )
}

// Snapshot Packages Modal
function SnapshotPackagesModal({ isOpen, onClose, snapshot }: {
  isOpen: boolean
  onClose: () => void
  snapshot: Snapshot
}) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const perPage = 20

  const { data, isLoading } = useQuery({
    queryKey: ['snapshot-packages', snapshot.name, page, query],
    queryFn: () => getSnapshotPackages(snapshot.name, page, perPage, query),
    enabled: isOpen
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Packages in ${snapshot.name}`}
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
                {data?.packages.map((pkg) => (
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

// Diff Modal
function DiffModal({ isOpen, onClose, snapshot1, snapshots }: {
  isOpen: boolean
  onClose: () => void
  snapshot1: string
  snapshots: Snapshot[]
}) {
  const [snapshot2, setSnapshot2] = useState('')
  const [showDiff, setShowDiff] = useState(false)

  const { data: diffData, isLoading, refetch } = useQuery({
    queryKey: ['diff', snapshot1, snapshot2],
    queryFn: () => diffSnapshots(snapshot1, snapshot2),
    enabled: false
  })

  const handleCompare = () => {
    if (snapshot2) {
      setShowDiff(true)
      refetch()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compare Snapshots"
      size="large"
    >
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <div className="card" style={{ flex: 1, padding: 'var(--space-md)' }}>
            <strong>{snapshot1}</strong>
          </div>
          <ArrowRight size={24} style={{ color: 'var(--text-tertiary)' }} />
          <div style={{ flex: 1 }}>
            <select
              className="input select"
              value={snapshot2}
              onChange={(e) => setSnapshot2(e.target.value)}
            >
              <option value="">Select snapshot...</option>
              {snapshots.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleCompare}
          disabled={!snapshot2 || isLoading}
        >
          {isLoading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {showDiff && Boolean(diffData) && (
        <div className="card" style={{ padding: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-md)' }}>Differences</h3>
          <pre style={{ overflow: 'auto', fontSize: 'var(--text-sm)' }}>
            {JSON.stringify(diffData as object, null, 2)}
          </pre>
        </div>
      )}

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

export default Snapshots
