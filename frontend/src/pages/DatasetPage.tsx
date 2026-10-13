import { useState, useRef } from 'react'
import axios from 'axios'
import { Upload, FileText, AlertTriangle, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface UploadResult {
  filename: string; row_count: number; columns: string[]; numeric_columns: string[]
  missing_values: Record<string, number>; preview: Record<string, string>[]
  detections_found: number; sample_detections: any[]; note: string
}

export default function DatasetPage() {
  const { isAnalyst } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const [dragover, setDragover] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setFile(f); setResult(null); setError('')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragover(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const upload = async () => {
    if (!file) return
    setUploading(true); setError(''); setResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await axios.post('/api/dataset/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Upload failed')
    } finally { setUploading(false) }
  }

  if (!isAnalyst) return (
    <div className="page-content">
      <div className="empty-state">
        <div className="empty-state-icon">🔒</div>
        <p>Analyst or Admin role required</p>
      </div>
    </div>
  )

  return (
    <div className="page-content animate-fade-in">
      <div className="section-header">
        <h2 className="section-title"><Upload size={18} className="text-cyan" /> Dataset Upload</h2>
      </div>

      {/* Upload zone */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          className={`upload-zone ${dragover ? 'dragover' : ''}`}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Upload size={32} style={{ color: 'var(--accent-cyan)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>
            {file ? file.name : 'Drop CSV file here or click to browse'}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Maximum 50MB. CSV format with numeric sensor columns.
          </p>
        </div>
        {file && (
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <FileText size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{file.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({(file.size / 1024).toFixed(1)} KB)</span>
            <button
              className="btn btn-primary"
              onClick={upload}
              disabled={uploading}
              style={{ marginLeft: 'auto' }}
            >
              {uploading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Analyzing...</> : 'Upload & Analyze'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
          <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />{error}
        </div>
      )}

      {result && (
        <div className="animate-fade-in">
          {/* Summary */}
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            {[
              { label: 'Rows', value: result.row_count.toLocaleString() },
              { label: 'Columns', value: result.columns.length },
              { label: 'Numeric Cols', value: result.numeric_columns.length },
              { label: 'Anomalies Found', value: result.detections_found, color: result.detections_found > 0 ? 'var(--danger)' : 'var(--success)' },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color ?? 'var(--accent-cyan)' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Column info */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Detected Columns</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {result.columns.map(c => (
                <span key={c} className={`badge ${result.numeric_columns.includes(c) ? 'badge-normal' : 'badge-offline'}`}>
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Data Preview (first 5 rows)</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>{result.columns.slice(0, 8).map(c => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.preview.map((row, i) => (
                    <tr key={i}>{result.columns.slice(0, 8).map(c => <td key={c}>{row[c]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detections */}
          {result.detections_found > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">
                <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                Anomalies Detected ({result.detections_found})
              </div>
              <table className="data-table">
                <thead><tr><th>Column</th><th>Value</th><th>Score</th><th>Severity</th></tr></thead>
                <tbody>
                  {result.sample_detections.slice(0, 10).map((d, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--accent-cyan)' }}>{d.column}</td>
                      <td>{d.value}</td>
                      <td>{d.anomaly_score}</td>
                      <td><span className={`badge badge-${d.severity.toLowerCase()}`}>{d.severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.detections_found === 0 && (
            <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
              <CheckCircle size={16} style={{ color: 'var(--success)' }} />
              <span style={{ color: 'var(--success)', fontSize: 13 }}>No anomalies detected in sampled rows</span>
            </div>
          )}

          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(6,182,212,0.05)', borderRadius: 6, border: '1px solid rgba(6,182,212,0.2)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>ℹ️ {result.note}</p>
          </div>
        </div>
      )}

      {/* Sample dataset info */}
      <div className="card">
        <div className="card-title">Sample Dataset</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          A synthetic sample dataset is included with the project at <code className="mono" style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>backend/data/sample_scada.csv</code>
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          This is synthetic data generated for demonstration purposes only. It is NOT the SWaT or WADI benchmark dataset.
        </p>
      </div>
    </div>
  )
}
