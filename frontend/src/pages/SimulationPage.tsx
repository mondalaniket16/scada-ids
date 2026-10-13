import { useState } from 'react'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { Play, Square, RefreshCw, Zap, ChevronRight } from 'lucide-react'

const SCENARIOS = [
  { id: 'normal', name: 'Normal Operation', desc: 'Baseline telemetry within normal ranges', color: '#22c55e' },
  { id: 'sensor_spike', name: 'Sensor Spike', desc: 'Sudden extreme value deviations', color: '#f97316' },
  { id: 'sensor_drift', name: 'Sensor Drift', desc: 'Gradual value deviation over time', color: '#eab308' },
  { id: 'stuck_sensor', name: 'Stuck Sensor', desc: 'Sensor reporting constant value', color: '#a855f7' },
  { id: 'sensor_spoofing', name: 'Sensor Spoofing', desc: 'Suspiciously perfect/constant values', color: '#ef4444' },
  { id: 'false_data', name: 'False Data Injection', desc: 'Injected out-of-range readings', color: '#dc2626' },
  { id: 'interruption', name: 'Telemetry Interruption', desc: 'Data gaps and zero readings', color: '#94a3b8' },
  { id: 'replay', name: 'Replay Attack', desc: 'Repeated pattern of past readings', color: '#06b6d4' },
]

interface SimStatus {
  running: boolean
  scenario: string
  speed: number
  tick: number
  attack_type: string
}

export default function SimulationPage() {
  const { isAnalyst } = useAuth()
  const [simStatus, setSimStatus] = useState<SimStatus | null>(null)
  const [selectedScenario, setSelectedScenario] = useState('normal')
  const [speed, setSpeed] = useState(1.0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/simulation/status')
      setSimStatus(res.data)
    } catch {}
  }

  const startSim = async () => {
    setLoading(true); setError(''); setMessage('')
    try {
      const res = await axios.post('/api/simulation/start', { scenario: selectedScenario, speed })
      setSimStatus(res.data.status)
      setMessage(`Simulation started: ${selectedScenario}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to start simulation')
    } finally {
      setLoading(false)
    }
  }

  const stopSim = async () => {
    setLoading(true); setError(''); setMessage('')
    try {
      const res = await axios.post('/api/simulation/stop')
      setSimStatus(res.data.status)
      setMessage('Simulation stopped')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to stop simulation')
    } finally {
      setLoading(false)
    }
  }

  useState(() => { fetchStatus() })

  return (
    <div className="page-content animate-fade-in">
      <div className="section-header">
        <h2 className="section-title">
          <Zap size={18} className="text-cyan" />
          Simulation Control Panel
        </h2>
        <button className="btn btn-secondary btn-sm" onClick={fetchStatus}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: 'var(--success)', fontSize: 13 }}>
          {message}
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Status Card */}
        <div className="card">
          <div className="card-title"><Zap size={14} className="text-cyan" /> Simulation Status</div>
          {simStatus ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`conn-dot ${simStatus.running ? 'connected' : 'disconnected'}`} />
                <span style={{
                  fontSize: 18, fontWeight: 700,
                  color: simStatus.running ? 'var(--accent-cyan)' : 'var(--text-muted)'
                }}>
                  {simStatus.running ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              {simStatus.running && (
                <>
                  <div><span className="text-muted" style={{ fontSize: 12 }}>Scenario: </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{simStatus.attack_type}</span></div>
                  <div><span className="text-muted" style={{ fontSize: 12 }}>Speed: </span>
                    <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{simStatus.speed}x</span></div>
                  <div><span className="text-muted" style={{ fontSize: 12 }}>Ticks: </span>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{simStatus.tick}</span></div>
                </>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading status...</div>
          )}

          <div className="divider" />

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10 }}>
            {isAnalyst && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={startSim}
                  disabled={loading}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Play size={14} /> Start
                </button>
                <button
                  className="btn btn-danger"
                  onClick={stopSim}
                  disabled={loading || !simStatus?.running}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Square size={14} /> Stop
                </button>
              </>
            )}
          </div>
        </div>

        {/* Configuration */}
        <div className="card">
          <div className="card-title">Configuration</div>
          <div className="form-group">
            <label className="form-label">Replay Speed</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[0.5, 1, 2, 5].map(s => (
                <button
                  key={s}
                  className={`btn btn-sm ${speed === s ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Note</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              All scenarios run in a completely synthetic/local simulation environment.
              No real industrial equipment is affected.
            </p>
          </div>
        </div>
      </div>

      {/* Scenario Selection */}
      <div className="card">
        <div className="card-title">Select Scenario</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {SCENARIOS.map(s => (
            <div
              key={s.id}
              onClick={() => isAnalyst && setSelectedScenario(s.id)}
              style={{
                padding: 14,
                borderRadius: 6,
                border: `1px solid ${selectedScenario === s.id ? s.color + '88' : 'var(--border)'}`,
                background: selectedScenario === s.id ? s.color + '11' : 'var(--bg-primary)',
                cursor: isAnalyst ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'flex-start', gap: 10
              }}
            >
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: s.color, flexShrink: 0, marginTop: 3
              }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {s.name}
                  {selectedScenario === s.id && <ChevronRight size={12} style={{ display: 'inline', marginLeft: 4, color: s.color }} />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
