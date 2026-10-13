import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Activity, AlertTriangle, BarChart2, History,
  Upload, LogOut, Shield, Cpu, Play, Square
} from 'lucide-react'

interface SidebarProps {
  simRunning: boolean
  wsConnected: boolean
  threatLevel: string
}

export default function Sidebar({ simRunning, wsConnected, threatLevel }: SidebarProps) {
  const { user, logout, isAdmin, isAnalyst } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `nav-item ${isActive ? 'active' : ''}`

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Shield size={18} color="#000" strokeWidth={2.5} />
        </div>
        <div className="sidebar-logo-text">
          <h1>SCADA IDS</h1>
          <p>ICS Security Monitor</p>
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span className={`conn-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
          <span style={{ color: wsConnected ? 'var(--success)' : 'var(--danger)' }}>
            {wsConnected ? 'Connected' : 'Offline'}
          </span>
        </div>
        <div className={`threat-indicator threat-${threatLevel}`} style={{ padding: '2px 8px', fontSize: 10 }}>
          {threatLevel}
        </div>
      </div>

      {/* Simulator status */}
      {simRunning && (
        <div style={{
          padding: '8px 16px',
          background: 'rgba(6,182,212,0.05)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11
        }}>
          <div style={{ width: 6, height: 6, background: 'var(--accent-cyan)', borderRadius: '50%', animation: 'pulse-slow 1.5s infinite' }} />
          <span style={{ color: 'var(--accent-cyan)' }}>Simulation Active</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-label">Monitoring</div>
          <NavLink to="/dashboard" className={navClass} end>
            <LayoutDashboard size={16} className="nav-item-icon" />
            Dashboard
          </NavLink>
          <NavLink to="/telemetry" className={navClass}>
            <Activity size={16} className="nav-item-icon" />
            Telemetry
          </NavLink>
          <NavLink to="/alerts" className={navClass}>
            <AlertTriangle size={16} className="nav-item-icon" />
            Alerts
          </NavLink>
          <NavLink to="/history" className={navClass}>
            <History size={16} className="nav-item-icon" />
            History
          </NavLink>
        </div>

        <div className="nav-section">
          <div className="nav-section-label">Analysis</div>
          <NavLink to="/analytics" className={navClass}>
            <BarChart2 size={16} className="nav-item-icon" />
            Analytics
          </NavLink>
          {isAnalyst && (
            <NavLink to="/simulation" className={navClass}>
              {simRunning
                ? <Square size={16} className="nav-item-icon" style={{ color: 'var(--accent-cyan)' }} />
                : <Play size={16} className="nav-item-icon" />
              }
              Simulation
            </NavLink>
          )}
          {isAnalyst && (
            <NavLink to="/dataset" className={navClass}>
              <Upload size={16} className="nav-item-icon" />
              Dataset Upload
            </NavLink>
          )}
        </div>

        {isAdmin && (
          <div className="nav-section">
            <div className="nav-section-label">Administration</div>
            <NavLink to="/settings" className={navClass}>
              <Cpu size={16} className="nav-item-icon" />
              Model & Settings
            </NavLink>
          </div>
        )}
      </nav>

      {/* User info */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        marginTop: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#000', flexShrink: 0
          }}>
            {user?.username[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.username}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {user?.role}
            </div>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleLogout} style={{ width: '100%', justifyContent: 'center' }}>
          <LogOut size={13} /> Sign Out
        </button>
      </div>
    </aside>
  )
}
