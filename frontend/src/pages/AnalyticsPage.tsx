import { useState, useEffect } from 'react'
import axios from 'axios'
import { BarChart2, TrendingUp, PieChart } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'

interface Analytics {
  total_samples: number
  total_anomalies: number
  total_normal: number
  anomaly_rate: number
  alert_by_severity: Record<string, number>
  scenario_distribution: Record<string, number>
  attack_type_distribution: Record<string, number>
  detection_trend: Array<{ timestamp: string; anomaly_score: number; is_anomaly: boolean }>
  model_info: any
  note: string
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#f43f5e']

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/analytics').then(r => { setData(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )

  if (!data) return <div className="page-content"><div className="empty-state">Failed to load analytics</div></div>

  const sevData = Object.entries(data.alert_by_severity).map(([name, value]) => ({ name, value }))
  const scenarioData = Object.entries(data.scenario_distribution).map(([name, value]) => ({ name, value }))
  const trendData = data.detection_trend.map(d => ({
    time: new Date(d.timestamp).toLocaleTimeString(),
    score: d.anomaly_score,
    anomaly: d.is_anomaly ? 1 : 0,
  }))

  return (
    <div className="page-content animate-fade-in">
      <div className="section-header">
        <h2 className="section-title"><BarChart2 size={18} className="text-cyan" /> Analytics</h2>
      </div>

      {/* Summary stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Samples', value: data.total_samples.toLocaleString(), color: 'var(--accent-cyan)' },
          { label: 'Anomalies', value: data.total_anomalies.toLocaleString(), color: 'var(--danger)' },
          { label: 'Normal', value: data.total_normal.toLocaleString(), color: 'var(--success)' },
          { label: 'Anomaly Rate', value: `${data.anomaly_rate}%`, color: 'var(--warning)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--accent-color': s.color } as any}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Detection Trend */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title"><TrendingUp size={14} className="text-cyan" /> Detection Score Trend (Recent 20)</div>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,45,69,0.8)" />
              <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 10 }} />
              <YAxis domain={[0, 1]} tick={{ fill: '#4b5563', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 12 }} />
              <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={false} name="Anomaly Score" />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="empty-state">No detection data yet</div>}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Alert Severity Distribution */}
        <div className="card">
          <div className="card-title"><PieChart size={14} className="text-cyan" /> Alerts by Severity</div>
          {sevData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sevData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,45,69,0.8)" />
                <XAxis dataKey="name" tick={{ fill: '#4b5563', fontSize: 11 }} />
                <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="value" radius={4}>
                  {sevData.map((_, i) => (
                    <Cell key={i} fill={['#dc2626', '#ea580c', '#ca8a04', '#16a34a'][i] ?? '#06b6d4'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state">No alert data yet</div>}
        </div>

        {/* Scenario Distribution */}
        <div className="card">
          <div className="card-title"><BarChart2 size={14} className="text-cyan" /> Detections by Scenario</div>
          {scenarioData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scenarioData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,45,69,0.8)" />
                <XAxis type="number" tick={{ fill: '#4b5563', fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#4b5563', fontSize: 10 }} width={80} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="value" radius={4}>
                  {scenarioData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state">No scenario data yet</div>}
        </div>
      </div>

      {/* Model Info */}
      <div className="card">
        <div className="card-title"><BarChart2 size={14} className="text-cyan" /> Model Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { label: 'Algorithm', value: data.model_info?.algorithm ?? 'N/A' },
            { label: 'Status', value: data.model_info?.status ?? 'N/A' },
            { label: 'Features', value: data.model_info?.feature_count ?? 'N/A' },
            { label: 'Threshold', value: data.model_info?.threshold?.toFixed(3) ?? 'N/A' },
            { label: 'Training Samples', value: data.model_info?.training_samples ?? 0 },
            { label: 'Trained At', value: data.model_info?.trained_at ? new Date(data.model_info.trained_at).toLocaleDateString() : 'Not yet' },
          ].map(m => (
            <div key={m.label} style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>{m.label}</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-cyan)' }}>{m.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(6,182,212,0.05)', borderRadius: 6, border: '1px solid rgba(6,182,212,0.2)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ℹ️ {data.note}
          </p>
        </div>
      </div>
    </div>
  )
}
