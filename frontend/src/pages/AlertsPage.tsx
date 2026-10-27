import { useState, useEffect } from 'react'
import axios from 'axios'
import { AlertTriangle, CheckCircle, Filter, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'

interface Alert {
  id: number
  timestamp: string
  sensor: string
  value: number
  anomaly_score: number
  severity: string
  attack_type: string
  status: string
  description: string
  acknowledged_by: string | null
  acknowledged_at: string | null
}

export default function AlertsPage() {
  const { isAnalyst } = useAuth()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(0)
  const PER_PAGE = 20

  const { latestAlerts } = useWebSocket()

  const fetchAlerts = async () => {
    setLoading(true)
    try {
      const params: any = { limit: PER_PAGE, offset: page * PER_PAGE }
      if (filterSeverity) params.severity = filterSeverity
      if (filterStatus) params.status = filterStatus
      const res = await axios.get('/api/alerts', { params })
      setAlerts(res.data.records)
      setTotal(res.data.total)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchAlerts() }, [filterSeverity, filterStatus, page])

  // Refresh when new WS alerts arrive
  useEffect(() => {
    if (latestAlerts.length > 0) fetchAlerts()
  }, [latestAlerts.length])

  const acknowledge = async (id: number) => {
    try {
      await axios.patch(`/api/alerts/${id}`, { status: 'ACKNOWLEDGED' })
      fetchAlerts()
    } catch {}
  }

  const severityColor = (s: string) => {
    if (s === 'CRITICAL') return 'var(--critical)'
    if (s === 'HIGH') return 'var(--high)'
    if (s === 'MEDIUM') return 'var(--medium)'
    return 'var(--low)'
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="section-header">
        <h2 className="section-title"><AlertTriangle size={18} style={{ color: 'var(--warning)' }} /> Security Alerts</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchAlerts}><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          <select className="input" value={filterSeverity} onChange={e => { setFilterSeverity(e.target.value); setPage(0) }}
            style={{ width: 160 }}>
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select className="input" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }}
            style={{ width: 160 }}>
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {total} total alerts
          </span>
        </div>
      </div>

      {/* Alert Table */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🛡</div>
            <p>No alerts found</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Sensor</th>
                  <th>Value</th>
                  <th>Score</th>
                  <th>Severity</th>
                  <th>Attack Type</th>
                  <th>Status</th>
                  {isAnalyst && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id}>
                    <td>{new Date(a.timestamp).toLocaleString()}</td>
                    <td style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{a.sensor}</td>
                    <td>{a.value?.toFixed(4)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="score-bar" style={{ width: 60 }}>
                          <div className="score-fill" style={{
                            width: `${a.anomaly_score * 100}%`,
                            background: severityColor(a.severity)
                          }} />
                        </div>
                        {a.anomaly_score?.toFixed(3)}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${a.severity.toLowerCase()}`}>{a.severity}</span>
                    </td>
                    <td style={{ color: 'var(--text-primary)' }}>{a.attack_type}</td>
                    <td>
                      <span className={`badge ${a.status === 'OPEN' ? 'badge-anomaly' : 'badge-normal'}`}>
                        {a.status}
                      </span>
                    </td>
                    {isAnalyst && (
                      <td>
                        {a.status === 'OPEN' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => acknowledge(a.id)}
                          >
                            <CheckCircle size={12} /> Ack
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PER_PAGE && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </button>
            <span style={{ padding: '5px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
              Page {page + 1} of {Math.ceil(total / PER_PAGE)}
            </span>
            <button className="btn btn-secondary btn-sm" disabled={(page + 1) * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
