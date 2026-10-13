import { useState, useEffect } from 'react'
import axios from 'axios'
import { Settings, Cpu, RefreshCw, Save } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const [modelStatus, setModelStatus] = useState<any>(null)
  const [threshold, setThreshold] = useState<number>(0.5)
  const [training, setTraining] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const fetchModel = async () => {
    try {
      const res = await axios.get('/api/model/status')
      setModelStatus(res.data)
      setThreshold(res.data.threshold ?? 0.5)
    } catch {}
  }

  useEffect(() => { fetchModel() }, [])

  const trainModel = async () => {
    setTraining(true); setMessage(''); setError('')
    try {
      const res = await axios.post('/api/model/train')
      setMessage(res.data.message)
      fetchModel()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Training failed')
    } finally { setTraining(false) }
  }

  const saveThreshold = async () => {
    setSaving(true); setMessage(''); setError('')
    try {
      await axios.patch('/api/model/threshold', { threshold })
      setMessage(`Threshold updated to ${threshold}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to update threshold')
    } finally { setSaving(false) }
  }

  if (!isAdmin) return (
    <div className="page-content">
      <div className="empty-state">
        <div className="empty-state-icon">🔒</div>
        <p>Admin role required to access settings</p>
      </div>
    </div>
  )

  return (
    <div className="page-content animate-fade-in">
      <div className="section-header">
        <h2 className="section-title"><Settings size={18} className="text-cyan" /> Model & Settings</h2>
        <button className="btn btn-secondary btn-sm" onClick={fetchModel}><RefreshCw size={13} /> Refresh</button>
      </div>

      {message && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: 'var(--success)', fontSize: 13 }}>
          ✓ {message}
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
          ✗ {error}
        </div>
      )}

      {/* Model Status */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><Cpu size={14} className="text-cyan" /> ML Model Status</div>
        {modelStatus ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Name', value: modelStatus.name },
              { label: 'Algorithm', value: modelStatus.algorithm },
              { label: 'Version', value: modelStatus.version },
              { label: 'Status', value: modelStatus.status },
              { label: 'Feature Count', value: modelStatus.feature_count },
              { label: 'Threshold', value: modelStatus.threshold?.toFixed(3) },
              { label: 'Training Samples', value: modelStatus.training_samples },
              { label: 'Trained At', value: modelStatus.trained_at ? new Date(modelStatus.trained_at).toLocaleString() : 'Not trained' },
            ].map(m => (
              <div key={m.label} style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>{m.label}</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-cyan)' }}>{m.value ?? 'N/A'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={trainModel} disabled={training}>
            {training ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Training...</> : '🤖 Train Model'}
          </button>
          <div style={{ padding: '8px 12px', background: 'rgba(6,182,212,0.05)', borderRadius: 6, border: '1px solid rgba(6,182,212,0.2)', fontSize: 12, color: 'var(--text-muted)' }}>
            Training requires at least 100 telemetry records. Run a simulation first.
          </div>
        </div>
      </div>

      {/* Threshold Control */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><Settings size={14} className="text-cyan" /> Anomaly Detection Threshold</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Scores above this threshold are classified as anomalies. Lower values = more sensitive.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>0.1 (High sensitivity)</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{threshold.toFixed(2)}</span>
              <span>0.9 (Low sensitivity)</span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveThreshold} disabled={saving}>
            {saving ? 'Saving...' : <><Save size={13} /> Save</>}
          </button>
        </div>
      </div>

      {/* System Info */}
      <div className="card">
        <div className="card-title">System Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
          {[
            { label: 'ML Framework', value: 'scikit-learn (IsolationForest)' },
            { label: 'Python Version', value: '3.14 (Windows AMD64)' },
            { label: 'Backend Framework', value: 'FastAPI + Uvicorn' },
            { label: 'Database', value: 'SQLite (SQLAlchemy ORM)' },
            { label: 'Frontend', value: 'React + Vite + TypeScript' },
            { label: 'Real-time', value: 'Native WebSocket' },
            { label: 'GPU Required', value: 'No (CPU only)' },
            { label: 'TensorFlow/Keras', value: 'Not used (future enhancement)' },
          ].map(m => (
            <div key={m.label} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 140, fontSize: 12 }}>{m.label}:</span>
              <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
