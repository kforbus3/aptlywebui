import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Database,
  Camera,
  Globe,
  Search,
  Settings,
  Menu,
  X,
  Package
} from 'lucide-react'
import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Mirrors from './pages/Mirrors'
import Snapshots from './pages/Snapshots'
import Publish from './pages/Publish'
import PackageSearch from './pages/PackageSearch'
import SettingsPage from './pages/Settings'
import './styles/App.css'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/mirrors', label: 'Mirrors', icon: Database },
    { path: '/snapshots', label: 'Snapshots', icon: Camera },
    { path: '/publish', label: 'Publish', icon: Globe },
    { path: '/search', label: 'Package Search', icon: Search },
    { path: '/settings', label: 'Settings', icon: Settings }
  ]

  return (
    <BrowserRouter>
      <div className="app">
        {/* Mobile header */}
        <header className="mobile-header">
          <div className="mobile-header-content">
            <Package className="logo-icon" />
            <span className="logo-text">Aptly WebUI</span>
            <button
              className="menu-button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </header>

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <Package className="logo-icon" />
            <span className="logo-text">Aptly WebUI</span>
          </div>

          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="nav-icon" size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="version">v1.0.0</div>
          </div>
        </aside>

        {/* Main content */}
        <main className="main-content">
          {sidebarOpen && (
            <div
              className="sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <div className="page-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/mirrors" element={<Mirrors />} />
              <Route path="/snapshots" element={<Snapshots />} />
              <Route path="/publish" element={<Publish />} />
              <Route path="/search" element={<PackageSearch />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
