import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import axios from 'axios'
import { useWebSocket } from './hooks/useWebSocket'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Security Dashboard',
  '/telemetry': 'Live Telemetry Monitor',
  '/alerts': 'Security Alerts',
  '/history': 'Historical Data',
  '/analytics': 'Analytics & Reports',
  '/simulation': 'Simulation Control',
  '/dataset': 'Dataset Upload',
  '/settings': 'Model & Settings',
}

export default function Layout() {
  const location = useLocation()
  const [simRunning, setSimRunning] = useState(false)
  const [threatLevel, setThreatLevel] = useState('LOW')

  const { connected } = useWebSocket()

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'SCADA IDS'

  useEffect(() => {
    // Poll sim status and dashboard stats
    const poll = async () => {
      try {
        const [simRes, statsRes] = await Promise.allSettled([
          axios.get('/api/simulation/status'),
          axios.get('/api/dashboard/stats'),
        ])
        if (simRes.status === 'fulfilled') setSimRunning(simRes.value.data.running)
        if (statsRes.status === 'fulfilled') setThreatLevel(statsRes.value.data.threat_level)
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app-layout">
      <Sidebar simRunning={simRunning} wsConnected={connected} threatLevel={threatLevel} />
      <div className="main-content">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">{pageTitle}</span>
          </div>
          <div className="topbar-right">
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {new Date().toLocaleTimeString()}
            </div>
            <div className={`badge ${connected ? 'badge-online' : 'badge-offline'}`}>
              <span className={`conn-dot ${connected ? 'connected' : 'disconnected'}`} />
              {connected ? 'LIVE' : 'OFFLINE'}
            </div>
            {simRunning && <div className="badge badge-normal">SIM ACTIVE</div>}
          </div>
        </div>

        {/* Page content via router */}
        <Outlet />
      </div>
    </div>
  )
}
