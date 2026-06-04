import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings,
  Database,
  Trash2,
  AlertTriangle,
  Check,
  RefreshCw,
  Activity,
  Key,
  Shield,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getConfig,
  dbCleanup,
  dbRecover,
  healthCheck,
  getEsmStatus
} from '../services/api'
import Modal from '../components/Modal'

function SettingsPage() {
  const queryClient = useQueryClient()
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false)
  const [recoverModalOpen, setRecoverModalOpen] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig
  })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: healthCheck,
    refetchInterval: 30000
  })

  const { data: esmStatus } = useQuery({
    queryKey: ['esm-status'],
    queryFn: getEsmStatus
  })

  const cleanupMutation = useMutation({
    mutationFn: () => dbCleanup(false),
    onSuccess: (data) => {
      toast.success('Database cleanup completed')
      setCleanupModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const recoverMutation = useMutation({
    mutationFn: dbRecover,
    onSuccess: () => {
      toast.success('Database recovery completed')
      setRecoverModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage Aptly Web UI configuration and system settings</p>
      </div>

      {/* Status Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon blue">
            <Activity size={24} />
          </div>
          <div className="stat-content">
            <h3>{health?.aptly_available ? 'Connected' : 'Disconnected'}</h3>
            <p>Aptly Status</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <Shield size={24} />
          </div>
          <div className="stat-content">
            <h3>{esmStatus?.esm_configured ? 'Configured' : 'Not Configured'}</h3>
            <p>ESM Status</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <Database size={24} />
          </div>
          <div className="stat-content">
            <h3>{(config as { rootDir?: string })?.rootDir || 'N/A'}</h3>
            <p>Database Root</p>
          </div>
        </div>
      </div>

      {/* Database Management */}
      <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
        <div style={{
          padding: 'var(--space-lg)',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)'
        }}>
          <Database size={24} />
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Database Management</h2>
        </div>

        <div style={{ padding: 'var(--space-lg)' }}>
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            {/* Cleanup */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-md)',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div>
                <h4 style={{ marginBottom: 'var(--space-xs)' }}>Database Cleanup</h4>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  Remove unreferenced packages and clean up the database
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setCleanupModalOpen(true)}
              >
                <Trash2 size={16} />
                Cleanup
              </button>
            </div>

            {/* Recover */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-md)',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div>
                <h4 style={{ marginBottom: 'var(--space-xs)' }}>Database Recovery</h4>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  Recover the database from corruption or errors
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setRecoverModalOpen(true)}
              >
                <RefreshCw size={16} />
                Recover
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
        <div
          style={{
            padding: 'var(--space-lg)',
            borderBottom: showConfig ? '1px solid var(--border-primary)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
          onClick={() => setShowConfig(!showConfig)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <Info size={24} />
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Aptly Configuration</h2>
          </div>
          {showConfig ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>

        {showConfig && (
          <div style={{ padding: 'var(--space-lg)' }}>
            <pre style={{
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-light)',
              padding: 'var(--space-lg)',
              borderRadius: 'var(--radius-md)',
              overflow: 'auto',
              fontSize: 'var(--text-sm)'
            }}>
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ESM Token Management */}
      <EsmTokenManager />

      {/* ESM Info */}
      <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
        <div style={{
          padding: 'var(--space-lg)',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)'
        }}>
          <Key size={24} />
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Ubuntu ESM</h2>
        </div>

        <div style={{ padding: 'var(--space-lg)' }}>
          <p style={{ marginBottom: 'var(--space-md)' }}>{esmStatus?.message}</p>

          {!esmStatus?.esm_configured && (
            <div style={{
              padding: 'var(--space-md)',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-warning)'
            }}>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-sm)' }}>
                <strong>To configure ESM:</strong>
              </p>
              <ol style={{ fontSize: 'var(--text-sm)', marginLeft: 'var(--space-lg)' }}>
                <li>Set the <code>ESM_TOKEN</code> environment variable</li>
                <li>Restart the Aptly Web UI service</li>
                <li>Create mirrors with the "ESM Repository" option enabled</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Cleanup Modal */}
      <Modal
        isOpen={cleanupModalOpen}
        onClose={() => setCleanupModalOpen(false)}
        title="Database Cleanup"
      >
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <AlertTriangle size={48} style={{ color: 'var(--color-warning)', marginBottom: 'var(--space-md)' }} />
          <p>This will remove unreferenced packages from the database.</p>
          <p style={{ marginTop: 'var(--space-md)', color: 'var(--text-secondary)' }}>
            This action is safe to run and will free up disk space used by orphaned package files.
          </p>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => setCleanupModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending}
          >
            {cleanupMutation.isPending ? 'Cleaning...' : 'Cleanup Database'}
          </button>
        </div>
      </Modal>

      {/* Recover Modal */}
      <Modal
        isOpen={recoverModalOpen}
        onClose={() => setRecoverModalOpen(false)}
        title="Database Recovery"
      >
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <AlertTriangle size={48} style={{ color: 'var(--color-error)', marginBottom: 'var(--space-md)' }} />
          <p>This will attempt to recover the database from corruption.</p>
          <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-error)' }}>
            Only use this if you're experiencing database errors. Backup your data first!
          </p>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => setRecoverModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={() => recoverMutation.mutate()}
            disabled={recoverMutation.isPending}
          >
            {recoverMutation.isPending ? 'Recovering...' : 'Recover Database'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ESM Token Manager Component
function EsmTokenManager() {
  const [tokens, setTokens] = useState<{ name: string; token: string; ubuntu_version: string }[]>(() => {
    const saved = localStorage.getItem('esm_tokens')
    return saved ? JSON.parse(saved) : []
  })
  const [showAddModal, setShowAddModal] = useState(false)
  const [newToken, setNewToken] = useState({ name: '', token: '', ubuntu_version: '22.04' })

  const saveTokens = (newTokens: typeof tokens) => {
    setTokens(newTokens)
    localStorage.setItem('esm_tokens', JSON.stringify(newTokens))
  }

  const handleAdd = () => {
    if (newToken.name && newToken.token) {
      saveTokens([...tokens, { ...newToken }])
      setNewToken({ name: '', token: '', ubuntu_version: '22.04' })
      setShowAddModal(false)
    }
  }

  const handleDelete = (index: number) => {
    const newTokens = tokens.filter((_, i) => i !== index)
    saveTokens(newTokens)
  }

  return (
    <>
      <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
        <div style={{
          padding: 'var(--space-lg)',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-md)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <Shield size={24} />
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>ESM Token Management</h2>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            Add Token
          </button>
        </div>

        <div style={{ padding: 'var(--space-lg)' }}>
          {tokens.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
              No ESM tokens configured. Add tokens for Ubuntu Pro/ESM repositories.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
              {tokens.map((t, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-md)',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <div>
                    <strong>{t.name}</strong>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 'var(--space-sm)' }}>
                      Ubuntu {t.ubuntu_version}
                    </span>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 'var(--space-xs)' }}>
                      Token: {t.token.substring(0, 8)}...{t.token.substring(t.token.length - 4)}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(idx)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 'var(--radius-md)' }}>
            <strong>About ESM Tokens</strong>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
              Ubuntu ESM (Extended Security Maintenance) requires a token for authentication.
              Different Ubuntu versions (20.04, 22.04, 24.04) have different tokens.
              Tokens are stored locally in your browser.
            </p>
          </div>
        </div>
      </div>

      {/* Add Token Modal */}
      {showAddModal && (
        <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add ESM Token">
          <div style={{ padding: 'var(--space-lg)' }}>
            <div className="form-group">
              <label className="label">Token Name *</label>
              <input
                type="text"
                className="input"
                value={newToken.name}
                onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
                placeholder="e.g., Ubuntu 22.04 ESM"
              />
            </div>

            <div className="form-group">
              <label className="label">Ubuntu Version *</label>
              <select
                className="input select"
                value={newToken.ubuntu_version}
                onChange={(e) => setNewToken({ ...newToken, ubuntu_version: e.target.value })}
              >
                <option value="20.04">Ubuntu 20.04 LTS (Focal)</option>
                <option value="22.04">Ubuntu 22.04 LTS (Jammy)</option>
                <option value="24.04">Ubuntu 24.04 LTS (Noble)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="label">ESM Token *</label>
              <input
                type="password"
                className="input"
                value={newToken.token}
                onChange={(e) => setNewToken({ ...newToken, token: e.target.value })}
                placeholder="Enter your Ubuntu Pro token"
              />
              <small style={{ color: 'var(--text-secondary)' }}>
                Get your token from <a href="https://ubuntu.com/pro" target="_blank" rel="noopener">ubuntu.com/pro</a>
              </small>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={!newToken.name || !newToken.token}>Add Token</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export default SettingsPage
