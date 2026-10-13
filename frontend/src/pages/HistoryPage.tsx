import { useState, useEffect } from 'react'
import axios from 'axios'
import { History, Filter } from 'lucide-react'

interface TelemetryRecord {
  id: number; timestamp: string; sensor: string; value: number; unit: string; scenario: string
}
interface DetectionRecord {
  id: number; timestamp: string; sensor: string; value: number; anomaly_score: number; is_anomaly: boolean; status: string; scenario: string
}

export default function HistoryPage() {
  const [tab, setTab] = useState<'telemetry' | 'detections'>('telemetry')
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([])
  const [detections, setDetections] = useState<DetectionRecord[]>([])
  const [totalT, setTotalT] = useState(0)
  const [totalD, setTotalD] = useState(0)
  const [loading, setLoading] = useState(false)
  const [sensorFilter, setSensorFilter] = useState('')
  const [anomalyOnly, setAnomalyOnly] = useState(false)
  const [page, setPage] = useState(0)
  const PER = 50

  const fetchData = async () => {
    setLoading(true)
    try {
      if (tab === 'telemetry') {
        const params: any = { limit: PER, offset: page * PER }
        if (sensorFilter) params.sensor = sensorFilter
        const res = await axios.get('/api/telemetry', { params })
        setTelemetry(res.data.records); setTotalT(res.data.total)
      } else {
        const params: any = { limit: PER, offset: page * PER, anomaly_only: anomalyOnly }
        if (sensorFilter) params.sensor = sensorFilter
        const res = await axios.get('/api/detections', { params })
        setDetections(res.data.records); setTotalD(res.data.total)
      }
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [tab, sensorFilter, anomalyOnly, page])

  const total = tab === 'telemetry' ? totalT : totalD

  return (
    <div className="page-content animate-fade-in">
      <div className="section-header">
        <h2 className="section-title"><History size={18} className="text-cyan" /> Historical Data</h2>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'telemetry' ? 'active' : ''}`} onClick={() => { setTab('telemetry'); setPage(0) }}>
          Telemetry Records
        </button>
        <button className={`tab ${tab === 'detections' ? 'active' : ''}`} onClick={() => { setTab('detections'); setPage(0) }}>
          Detection Results
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          <select className="input" value={sensorFilter} onChange={e => { setSensorFilter(e.target.value); setPage(0) }} style={{ width: 160 }}>
            <option value="">All Sensors</option>
            {['LIT101', 'FIT101', 'AIT201', 'AIT202', 'AIT203', 'FIT201', 'MV101', 'P101', 'P102'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {tab === 'detections' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={anomalyOnly} onChange={e => { setAnomalyOnly(e.target.checked); setPage(0) }} />
              Anomalies only
            </label>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {total.toLocaleString()} records
          </span>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : tab === 'telemetry' ? (
          telemetry.length === 0
            ? <div className="empty-state"><p>No telemetry records yet. Start a simulation.</p></div>
            : <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Time</th><th>Sensor</th><th>Value</th><th>Unit</th><th>Scenario</th></tr></thead>
                <tbody>
                  {telemetry.map(r => (
                    <tr key={r.id}>
                      <td>{new Date(r.timestamp).toLocaleString()}</td>
                      <td style={{ color: 'var(--accent-cyan)' }}>{r.sensor}</td>
                      <td>{r.value?.toFixed(4)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.unit}</td>
                      <td><span className="badge badge-normal">{r.scenario}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        ) : (
          detections.length === 0
            ? <div className="empty-state"><p>No detection records yet.</p></div>
            : <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Time</th><th>Sensor</th><th>Value</th><th>Score</th><th>Status</th><th>Scenario</th></tr></thead>
                <tbody>
                  {detections.map(r => (
                    <tr key={r.id}>
                      <td>{new Date(r.timestamp).toLocaleString()}</td>
                      <td style={{ color: 'var(--accent-cyan)' }}>{r.sensor}</td>
                      <td>{r.value?.toFixed(4)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="score-bar" style={{ width: 50 }}>
                            <div className="score-fill" style={{
                              width: `${r.anomaly_score * 100}%`,
                              background: r.is_anomaly ? 'var(--danger)' : 'var(--accent-cyan)'
                            }} />
                          </div>
                          {r.anomaly_score?.toFixed(3)}
                        </div>
                      </td>
                      <td><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.scenario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}

        {total > PER && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span style={{ padding: '5px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
              {page + 1} / {Math.ceil(total / PER)}
            </span>
            <button className="btn btn-secondary btn-sm" disabled={(page + 1) * PER >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}
