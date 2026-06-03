import { useQuery } from '@tanstack/react-query'
import {
  Database,
  Camera,
  Globe,
  Package,
  Activity,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { getMirrors, getSnapshots, getPublished, healthCheck, getStats } from '../services/api'
import { useNavigate } from 'react-router-dom'

function Dashboard() {
  const navigate = useNavigate()

  const { data: mirrors, isLoading: mirrorsLoading } = useQuery({
    queryKey: ['mirrors'],
    queryFn: getMirrors
  })

  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots
  })

  const { data: published, isLoading: publishedLoading } = useQuery({
    queryKey: ['published'],
    queryFn: getPublished
  })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: healthCheck,
    refetchInterval: 30000
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats
  })

  const stats = [
    {
      title: 'Mirrors',
      value: mirrors?.length || 0,
      icon: Database,
      color: 'blue',
      path: '/mirrors',
      loading: mirrorsLoading
    },
    {
      title: 'Snapshots',
      value: snapshots?.length || 0,
      icon: Camera,
      color: 'green',
      path: '/snapshots',
      loading: snapshotsLoading
    },
    {
      title: 'Published',
      value: published?.length || 0,
      icon: Globe,
      color: 'orange',
      path: '/publish',
      loading: publishedLoading
    },
    {
      title: 'Total Packages',
      value: statsData?.stats?.total_packages?.toLocaleString() || '...',
      icon: Package,
      color: 'purple',
      path: '/search',
      loading: statsLoading
    }
  ]

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your Aptly repository management</p>

        {/* Health status */}
        <div className="health-status" style={{ marginTop: 'var(--space-md)' }}>
          {health && (
            <div className={`badge ${health.aptly_available ? 'badge-success' : 'badge-error'}`}>
              {health.aptly_available ? (
                <><CheckCircle size={14} style={{ marginRight: 'var(--space-xs)' }} /> Aptly Connected</>
              ) : (
                <><AlertCircle size={14} style={{ marginRight: 'var(--space-xs)' }} /> Aptly Unavailable</>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="stat-card"
            onClick={() => navigate(stat.path)}
            style={{ cursor: 'pointer' }}
          >
            <div className={`stat-icon ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div className="stat-content">
              {stat.loading ? (
                <div className="skeleton" style={{ width: '60px', height: '36px' }} />
              ) : (
                <h3>{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</h3>
              )}
              <p>{stat.title}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
        <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Activity size={20} />
            Quick Actions
          </h2>
        </div>
        <div style={{ padding: 'var(--space-lg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/mirrors')}
              style={{ justifyContent: 'flex-start' }}
            >
              <Database size={18} />
              Create New Mirror
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/snapshots')}
              style={{ justifyContent: 'flex-start' }}
            >
              <Camera size={18} />
              Create Snapshot
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/publish')}
              style={{ justifyContent: 'flex-start' }}
            >
              <Globe size={18} />
              Publish Snapshot
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/search')}
              style={{ justifyContent: 'flex-start' }}
            >
              <Package size={18} />
              Search Packages
            </button>
          </div>
        </div>
      </div>

      {/* Recent Snapshots */}
      {snapshots && snapshots.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
          <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-primary)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Recent Snapshots</h2>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Packages</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.slice(0, 5).map((snapshot) => (
                  <tr
                    key={snapshot.name}
                    onClick={() => navigate(`/snapshots?name=${encodeURIComponent(snapshot.name)}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><strong>{snapshot.name}</strong></td>
                    <td>{snapshot.description}</td>
                    <td>{snapshot.num_packages?.toLocaleString() || 'N/A'}</td>
                    <td>{snapshot.created_at ? new Date(snapshot.created_at).toLocaleString() : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snapshots.length > 5 && (
            <div style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'center', borderTop: '1px solid var(--border-primary)' }}>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => navigate('/snapshots')}
              >
                View All Snapshots
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Dashboard
