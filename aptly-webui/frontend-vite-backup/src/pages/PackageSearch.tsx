import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Package,
  Camera,
  Globe,
  Check,
  X,
  Filter,
  Download,
  Hash,
  Info
} from 'lucide-react'
import { searchPackages, type PackageSearchResult } from '../services/api'

function PackageSearch() {
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [inSnapshots, setInSnapshots] = useState(true)
  const [inPublished, setInPublished] = useState(true)

  const { data: results, isLoading, refetch } = useQuery({
    queryKey: ['package-search', searchTerm, inSnapshots, inPublished],
    queryFn: () => searchPackages(searchTerm, { in_snapshots: inSnapshots, in_published: inPublished }),
    enabled: !!searchTerm
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      setSearchTerm(query)
      refetch()
    }
  }

  const clearSearch = () => {
    setQuery('')
    setSearchTerm('')
  }

  const groupedResults = results?.results.reduce((acc: Record<string, PackageSearchResult[]>, result) => {
    const key = result.type === 'snapshot' ? result.name! : `${result.prefix}/${result.distribution}`
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(result)
    return acc
  }, {})

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Package Search</h1>
        <p>Search for packages across all snapshots and published repositories</p>
      </div>

      {/* Search Box */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <form onSubmit={handleSearch} style={{ padding: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search
                size={20}
                style={{
                  position: 'absolute',
                  left: 'var(--space-md)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)'
                }}
              />
              <input
                type="text"
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for packages (e.g., nginx, apache2, postgresql)..."
                style={{ paddingLeft: '3rem', fontSize: 'var(--text-lg)' }}
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  style={{
                    position: 'absolute',
                    right: 'var(--space-md)',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-tertiary)'
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <button type="submit" className="btn btn-primary" disabled={isLoading || !query.trim()}>
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Filters */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-xl)',
            marginTop: 'var(--space-lg)',
            paddingTop: 'var(--space-lg)',
            borderTop: '1px solid var(--border-primary)'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={inSnapshots}
                onChange={(e) => setInSnapshots(e.target.checked)}
              />
              <Camera size={16} />
              <span>Search in Snapshots</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={inPublished}
                onChange={(e) => setInPublished(e.target.checked)}
              />
              <Globe size={16} />
              <span>Search in Published</span>
            </label>
          </div>
        </form>
      </div>

      {/* Results */}
      <div className="card">
        {!searchTerm ? (
          <div className="empty-state">
            <Search size={48} className="empty-state-icon" />
            <h3>Enter a search term</h3>
            <p>Search for packages by name across all your snapshots and published repositories.</p>
          </div>
        ) : isLoading ? (
          <div className="loading-container">
            <div className="spinner" style={{ width: '40px', height: '40px' }} />
            <p>Searching for packages...</p>
          </div>
        ) : results?.results.length === 0 ? (
          <div className="empty-state">
            <X size={48} className="empty-state-icon" />
            <h3>No packages found</h3>
            <p>No packages matching "{searchTerm}" were found in the selected repositories.</p>
          </div>
        ) : (
          <>
            <div style={{
              padding: 'var(--space-md) var(--space-lg)',
              borderBottom: '1px solid var(--border-primary)',
              backgroundColor: 'var(--bg-tertiary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Check size={16} className="text-success" style={{ color: 'var(--color-success)' }} />
                <span>Found <strong>{results?.total}</strong> packages matching "{searchTerm}"</span>
              </div>
              <button className="btn btn-sm btn-secondary">
                <Download size={14} />
                Export Results
              </button>
            </div>

            {results?.note && (
              <div style={{
                padding: 'var(--space-sm) var(--space-md)',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderBottom: '1px solid var(--border-primary)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-warning)'
              }}>
                <Info size={14} style={{ marginRight: 'var(--space-sm)' }} />
                {results.note}
              </div>
            )}

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Type</th>
                    <th>Package</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedResults && Object.entries(groupedResults).map(([location, pkgs]) => (
                    <>
                      <tr key={location} style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <td colSpan={3} style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                          <strong style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                            {pkgs[0].type === 'snapshot' ? (
                              <><Camera size={16} /> Snapshot: {location}</>
                            ) : (
                              <><Globe size={16} /> Published: {location}</>
                            )}
                          </strong>
                        </td>
                      </tr>
                      {pkgs.map((pkg, idx) => (
                        <tr key={`${location}-${idx}`}>
                          <td></td>
                          <td>
                            <span className={`badge ${pkg.type === 'snapshot' ? 'badge-info' : 'badge-success'}`}>
                              {pkg.type}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontFamily: 'monospace', fontSize: 'var(--text-sm)' }}>
                              {pkg.package}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Search Tips */}
      <div style={{ marginTop: 'var(--space-xl)' }}>
        <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--text-lg)' }}>Search Tips</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--space-md)'
        }}>
          <div className="card" style={{ padding: 'var(--space-lg)' }}>
            <h4 style={{ marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Package size={18} />
              Package Names
            </h4>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Search by package name like "nginx", "apache2", or "postgresql". Partial matches are supported.
            </p>
          </div>

          <div className="card" style={{ padding: 'var(--space-lg)' }}>
            <h4 style={{ marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Hash size={18} />
              Versions
            </h4>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Results show the full package key including name, version, and architecture.
            </p>
          </div>

          <div className="card" style={{ padding: 'var(--space-lg)' }}>
            <h4 style={{ marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Filter size={18} />
              Filtering
            </h4>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Toggle between searching in snapshots, published repos, or both to narrow results.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PackageSearch
