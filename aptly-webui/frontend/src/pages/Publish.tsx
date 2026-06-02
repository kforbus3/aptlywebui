import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Globe,
  Plus,
  Trash2,
  ArrowRightLeft,
  Link,
  Key,
  Hash,
  Tag,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getPublished,
  getSnapshots,
  publishSnapshot,
  switchPublished,
  dropPublished,
  type PublishedRepo,
  type Snapshot
} from '../services/api'
import Modal from '../components/Modal'

function Publish() {
  const queryClient = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [switchModalOpen, setSwitchModalOpen] = useState(false)
  const [selectedPublish, setSelectedPublish] = useState<PublishedRepo | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [publishToDelete, setPublishToDelete] = useState<PublishedRepo | null>(null)
  const [forceDelete, setForceDelete] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Form state
  const [formData, setFormData] = useState({
    snapshot: '',
    distribution: '',
    prefix: '',
    component: '',
    architectures: [] as string[],
    label: '',
    origin: '',
    gpg_key: '',
    gpg_skip: false,
    acquire_by_hash: true,
    skip_contents: false
  })

  // Switch form state
  const [switchFormData, setSwitchFormData] = useState({
    snapshot: '',
    gpg_skip: false,
    force_overwrite: false
  })

  const { data: published, isLoading } = useQuery({
    queryKey: ['published'],
    queryFn: getPublished
  })

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots
  })

  const publishMutation = useMutation({
    mutationFn: publishSnapshot,
    onSuccess: () => {
      toast.success('Snapshot published successfully')
      queryClient.invalidateQueries({ queryKey: ['published'] })
      setCreateModalOpen(false)
      resetForm()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const switchMutation = useMutation({
    mutationFn: ({ prefix, distribution }: { prefix: string; distribution: string }) =>
      switchPublished(prefix, distribution, switchFormData.snapshot, {
        gpg_skip: switchFormData.gpg_skip,
        force_overwrite: switchFormData.force_overwrite
      }),
    onSuccess: () => {
      toast.success('Published repository switched successfully')
      queryClient.invalidateQueries({ queryKey: ['published'] })
      setSwitchModalOpen(false)
      resetSwitchForm()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const dropMutation = useMutation({
    mutationFn: ({ prefix, distribution, force }: { prefix: string; distribution: string; force: boolean }) =>
      dropPublished(prefix, distribution, force),
    onSuccess: () => {
      toast.success('Published repository removed successfully')
      queryClient.invalidateQueries({ queryKey: ['published'] })
      setDeleteModalOpen(false)
      setPublishToDelete(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const resetForm = () => {
    setFormData({
      snapshot: '',
      distribution: '',
      prefix: '',
      component: '',
      architectures: [],
      label: '',
      origin: '',
      gpg_key: '',
      gpg_skip: false,
      acquire_by_hash: true,
      skip_contents: false
    })
  }

  const resetSwitchForm = () => {
    setSwitchFormData({
      snapshot: '',
      gpg_skip: false,
      force_overwrite: false
    })
  }

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault()
    publishMutation.mutate(formData)
  }

  const handleSwitch = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedPublish) {
      switchMutation.mutate({
        prefix: selectedPublish.prefix,
        distribution: selectedPublish.distribution
      })
    }
  }

  const handleDrop = () => {
    if (publishToDelete) {
      dropMutation.mutate({
        prefix: publishToDelete.prefix,
        distribution: publishToDelete.distribution,
        force: forceDelete
      })
    }
  }

  const toggleRow = (key: string) => {
    const newSet = new Set(expandedRows)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setExpandedRows(newSet)
  }

  const getPublishUrl = (pub: PublishedRepo) => {
    const prefix = pub.prefix || ''
    return prefix ? `${window.location.origin}/${prefix}` : window.location.origin
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Published Repositories</h1>
        <p>Manage your published APT repositories</p>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus size={18} />
            Publish Snapshot
          </button>
        </div>
      </div>

      {/* Published Table */}
      <div className="card">
        {isLoading ? (
          <div className="loading-container">
            <div className="spinner" style={{ width: '40px', height: '40px' }} />
            <p>Loading published repositories...</p>
          </div>
        ) : published?.length === 0 ? (
          <div className="empty-state">
            <Globe size={48} className="empty-state-icon" />
            <h3>No Published Repositories</h3>
            <p>Publish a snapshot to create an APT repository.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Distribution</th>
                  <th>Prefix</th>
                  <th>Source</th>
                  <th>Architectures</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {published?.map((pub) => {
                  const key = `${pub.prefix}-${pub.distribution}`
                  const sourceName = pub.sources?.[0]?.Name || 'N/A'
                  return (
                    <>
                      <tr key={key}>
                        <td>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => toggleRow(key)}
                            style={{ marginRight: 'var(--space-sm)' }}
                          >
                            {expandedRows.has(key) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <strong>{pub.distribution}</strong>
                        </td>
                        <td>{pub.prefix || '(root)'}</td>
                        <td>
                          <span className="badge badge-info">{pub.source_kind}</span>
                          {' '}
                          {sourceName}
                        </td>
                        <td>{pub.architectures?.join(', ')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => {
                                setSelectedPublish(pub)
                                setSwitchModalOpen(true)
                              }}
                              title="Switch to different snapshot"
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                            <a
                              href={getPublishUrl(pub)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-secondary"
                              title="Open repository URL"
                            >
                              <Link size={14} />
                            </a>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                setPublishToDelete(pub)
                                setDeleteModalOpen(true)
                              }}
                              title="Drop publication"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(key) && (
                        <tr className="expanded-row">
                          <td colSpan={5} style={{ backgroundColor: 'var(--bg-tertiary)', padding: 'var(--space-lg)' }}>
                            <div style={{ fontSize: 'var(--text-sm)' }}>
                              <div style={{ marginBottom: 'var(--space-sm)' }}>
                                <strong>Sources:</strong>
                              </div>
                              <ul style={{ marginLeft: 'var(--space-lg)', marginBottom: 'var(--space-md)' }}>
                                {pub.sources?.map((source, idx) => (
                                  <li key={idx}>
                                    {source.Name}
                                    {source.Component && ` (component: ${source.Component})`}
                                  </li>
                                ))}
                              </ul>
                              {pub.label && <div><strong>Label:</strong> {pub.label}</div>}
                              {pub.origin && <div><strong>Origin:</strong> {pub.origin}</div>}
                              <div style={{ marginTop: 'var(--space-sm)' }}>
                                <strong>Acquire by Hash:</strong> {pub.acquire_by_hash ? 'Yes' : 'No'}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Publish Snapshot"
        size="large"
      >
        <form onSubmit={handlePublish}>
          <div className="form-group">
            <label className="label">Snapshot *</label>
            <select
              className="input select"
              value={formData.snapshot}
              onChange={(e) => setFormData({ ...formData, snapshot: e.target.value })}
              required
            >
              <option value="">Select snapshot...</option>
              {snapshots?.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.num_packages} packages)
                </option>
              ))}
            </select>
          </div>

          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
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
            <div className="form-group">
              <label className="label">Prefix (optional)</label>
              <input
                type="text"
                className="input"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                placeholder="e.g., debian or (empty for root)"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Component (optional)</label>
            <input
              type="text"
              className="input"
              value={formData.component}
              onChange={(e) => setFormData({ ...formData, component: e.target.value })}
              placeholder="e.g., main"
            />
          </div>

          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div className="form-group">
              <label className="label">Label (optional)</label>
              <input
                type="text"
                className="input"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g., Debian Repository"
              />
            </div>
            <div className="form-group">
              <label className="label">Origin (optional)</label>
              <input
                type="text"
                className="input"
                value={formData.origin}
                onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                placeholder="e.g., Debian"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label">GPG Key (optional)</label>
            <input
              type="text"
              className="input"
              value={formData.gpg_key}
              onChange={(e) => setFormData({ ...formData, gpg_key: e.target.value })}
              placeholder="GPG key ID or fingerprint"
            />
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.gpg_skip}
                onChange={(e) => setFormData({ ...formData, gpg_skip: e.target.checked })}
              />
              <span>Skip GPG signing</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.acquire_by_hash}
                onChange={(e) => setFormData({ ...formData, acquire_by_hash: e.target.checked })}
              />
              <span>Acquire by Hash</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.skip_contents}
                onChange={(e) => setFormData({ ...formData, skip_contents: e.target.checked })}
              />
              <span>Skip Contents generation</span>
            </label>
          </div>

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
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Switch Modal */}
      <Modal
        isOpen={switchModalOpen}
        onClose={() => setSwitchModalOpen(false)}
        title="Switch Published Snapshot"
      >
        <form onSubmit={handleSwitch}>
          <p style={{ marginBottom: 'var(--space-lg)' }}>
            Switch <strong>{selectedPublish?.distribution}</strong> to a new snapshot:
          </p>

          <div className="form-group">
            <label className="label">New Snapshot *</label>
            <select
              className="input select"
              value={switchFormData.snapshot}
              onChange={(e) => setSwitchFormData({ ...switchFormData, snapshot: e.target.value })}
              required
            >
              <option value="">Select snapshot...</option>
              {snapshots?.filter(s => s.name !== selectedPublish?.sources?.[0]?.Name).map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.num_packages} packages)
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={switchFormData.gpg_skip}
                onChange={(e) => setSwitchFormData({ ...switchFormData, gpg_skip: e.target.checked })}
              />
              <span>Skip GPG signing</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={switchFormData.force_overwrite}
                onChange={(e) => setSwitchFormData({ ...switchFormData, force_overwrite: e.target.checked })}
              />
              <span>Force overwrite</span>
            </label>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSwitchModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={switchMutation.isPending}
            >
              {switchMutation.isPending ? 'Switching...' : 'Switch'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Drop Published Repository"
      >
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <p>Are you sure you want to drop the published repository <strong>{publishToDelete?.prefix}/{publishToDelete?.distribution}</strong>?</p>
          <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-error)' }}>
            This will remove the APT repository. Snapshots will not be affected.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={forceDelete}
              onChange={(e) => setForceDelete(e.target.checked)}
            />
            <span>Force drop (ignore dependencies)</span>
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
            onClick={handleDrop}
            disabled={dropMutation.isPending}
          >
            {dropMutation.isPending ? 'Dropping...' : 'Drop'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default Publish
