import { useState, useEffect } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import {
  Activity, AlertTriangle, Shield, Cpu, TrendingUp,
  BarChart2, Clock
} from 'lucide-react'

interface DashboardStats {
  total_telemetry: number
  total_anomalies: number
  open_alerts: number
  threat_level: string
  simulation: { running: boolean; scenario: string; speed: number; attack_type: string }
  model: { status: string; algorithm: string; trained_at: string | null }
  recent_alerts: Array<{
    id: number; timestamp: string; sensor: string;
    severity: string; attack_type: string; status: string
  }>
  recent_detections: Array<{
    timestamp: string; sensor: string; value: number;
    anomaly_score: number; is_anomaly: boolean; status: string
  }>
  alert_counts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number }
}

const SENSOR_COLORS: Record<string, string> = {
  LIT101: '#06b6d4',
  FIT101: '#3b82f6',
  AIT201: '#14b8a6',
  AIT202: '#8b5cf6',
  AIT203: '#f59e0b',
  FIT201: '#10b981',
  MV101: '#f43f5e',
  P101: '#84cc16',
  P102: '#fb923c',
}

export default function DashboardPage() {
  const { messages, latestBySensor, latestAlerts, connected } = useWebSocket()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<any[]>([])

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/dashboard/stats')
      setStats(res.data)
    } catch (e) {
      console.error('Failed to fetch stats', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 10000)
    return () => clearInterval(interval)
  }, [])

  // Build chart data from WS messages (LIT101 as primary sensor)
  useEffect(() => {
    const relevant = messages
      .filter(m => m.type === 'telemetry' && m.sensor === 'LIT101')
      .slice(0, 30)
      .reverse()
    setChartData(relevant.map(m => ({
      time: new Date(m.timestamp).toLocaleTimeString(),
      value: m.value?.toFixed(2),
      score: m.anomaly_score?.toFixed(3),
      anomaly: m.is_anomaly,
    })))
  }, [messages])

  const threatLevel = stats?.threat_level ?? 'LOW'

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString()
    } catch { return iso }
  }

  const getBadgeClass = (sev: string) => `badge badge-${sev.toLowerCase()}`

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    )
  }

  return (
    <div className="page-content animate-fade-in">
      {/* Threat Level Banner */}
      {(threatLevel === 'HIGH' || threatLevel === 'CRITICAL') && (
        <div style={{
          background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
          borderRadius: 8, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <AlertTriangle size={16} color="var(--danger)" />
          <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 13 }}>
            THREAT LEVEL: {threatLevel} — Active security anomalies detected
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card" style={{ '--accent-color': 'var(--accent-cyan)' } as any}>
          <div className="stat-label">Total Telemetry</div>
          <div className="stat-value">{(stats?.total_telemetry ?? 0).toLocaleString()}</div>
          <div className="stat-sub">Records processed</div>
        </div>

        <div className="stat-card" style={{ '--accent-color': 'var(--danger)' } as any}>
          <div className="stat-label">Anomalies Detected</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>
            {(stats?.total_anomalies ?? 0).toLocaleString()}
          </div>
          <div className="stat-sub">Total detections</div>
        </div>

        <div className="stat-card" style={{ '--accent-color': 'var(--warning)' } as any}>
          <div className="stat-label">Open Alerts</div>
          <div className="stat-value" style={{ color: stats?.open_alerts ? 'var(--warning)' : 'var(--success)' }}>
            {stats?.open_alerts ?? 0}
          </div>
          <div className="stat-sub">Requires attention</div>
        </div>

        <div className="stat-card" style={{ '--accent-color': '#8b5cf6' } as any}>
          <div className="stat-label">Threat Level</div>
          <div className={`threat-indicator threat-${threatLevel}`} style={{ display: 'inline-flex', marginTop: 4 }}>
            <Shield size={12} /> {threatLevel}
          </div>
          <div className="stat-sub" style={{ marginTop: 4 }}>System status</div>
        </div>

        <div className="stat-card" style={{ '--accent-color': 'var(--accent-teal)' } as any}>
          <div className="stat-label">Simulation</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span className={`conn-dot ${stats?.simulation?.running ? 'connected' : 'disconnected'}`} />
            <span className="stat-value" style={{ fontSize: 16, color: stats?.simulation?.running ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
              {stats?.simulation?.running ? stats.simulation.attack_type : 'Stopped'}
            </span>
          </div>
          <div className="stat-sub">{stats?.simulation?.running ? `Speed: ${stats.simulation.speed}x` : 'No active simulation'}</div>
        </div>

        <div className="stat-card" style={{ '--accent-color': 'var(--accent-blue)' } as any}>
          <div className="stat-label">ML Model</div>
          <div className="stat-value" style={{ fontSize: 14, marginTop: 4, color: 'var(--accent-blue)' }}>
            {stats?.model?.algorithm ?? 'N/A'}
          </div>
          <div className="stat-sub">
            {stats?.model?.status === 'loaded' || stats?.model?.status === 'trained'
              ? '✓ Trained & Active'
              : 'Training on first data batch'}
          </div>
        </div>
      </div>

      {/* Charts & Alerts Row */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Live Telemetry Chart */}
        <div className="card">
          <div className="card-title">
            <TrendingUp size={14} className="text-cyan" />
            Live Telemetry — LIT101 (Tank Level)
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span className={`conn-dot ${connected ? 'connected' : 'disconnected'}`} />
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,45,69,0.8)" />
                <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 10 }} />
                <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line
                  type="monotone" dataKey="value" stroke="#06b6d4"
                  strokeWidth={2} dot={(props: any) => {
                    const isAnom = props.payload?.anomaly === true
                    return <circle key={props.key} cx={props.cx} cy={props.cy} r={isAnom ? 5 : 3}
                      fill={isAnom ? '#ef4444' : '#06b6d4'}
                      stroke={isAnom ? '#ef444488' : 'transparent'}
                      strokeWidth={4}
                    />
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ height: 180 }}>
              <p>Start a simulation to see live data</p>
            </div>
          )}
        </div>

        {/* Live Anomaly Score */}
        <div className="card">
          <div className="card-title">
            <Activity size={14} className="text-cyan" />
            Anomaly Score — LIT101
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,45,69,0.8)" />
                <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 10 }} />
                <YAxis domain={[0, 1]} tick={{ fill: '#4b5563', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line
                  type="monotone" dataKey="score" stroke="#f97316"
                  strokeWidth={2} dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ height: 180 }}>
              <p>Start a simulation to see scores</p>
            </div>
          )}
        </div>
      </div>

      {/* Sensor Values */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">
          <Cpu size={14} className="text-cyan" />
          Live Sensor Values
        </div>
        <div className="sensor-grid">
          {Object.entries(latestBySensor).length > 0
            ? Object.entries(latestBySensor).map(([sensor, msg]) => (
              <div key={sensor} className={`sensor-card ${msg.is_anomaly ? 'anomaly' : ''}`}>
                <div className="sensor-name">{sensor}</div>
                <div className="sensor-value" style={{ color: SENSOR_COLORS[sensor] ?? 'var(--accent-cyan)' }}>
                  {msg.value?.toFixed(3) ?? '--'}
                </div>
                <div className="sensor-unit">{msg.unit}</div>
                {msg.is_anomaly && (
                  <div style={{ marginTop: 6 }}>
                    <span className="badge badge-anomaly" style={{ fontSize: 10 }}>
                      ⚠ {msg.severity}
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 6 }}>
                  <div className="score-bar">
                    <div
                      className="score-fill"
                      style={{
                        width: `${(msg.anomaly_score ?? 0) * 100}%`,
                        background: (msg.anomaly_score ?? 0) > 0.5 ? 'var(--danger)' : 'var(--accent-cyan)'
                      }}
                    />
                  </div>
                </div>
              </div>
            ))
            : ['LIT101', 'FIT101', 'AIT201', 'AIT202', 'AIT203', 'FIT201', 'MV101', 'P101', 'P102'].map(s => (
              <div key={s} className="sensor-card">
                <div className="sensor-name">{s}</div>
                <div className="sensor-value" style={{ color: 'var(--text-muted)', fontSize: 16 }}>--</div>
                <div className="sensor-unit text-muted">Waiting...</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Recent Alerts & Detections */}
      <div className="grid-2">
        {/* Recent Alerts */}
        <div className="card">
          <div className="card-title">
            <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
            Recent Alerts
          </div>
          {(latestAlerts.length > 0 ? latestAlerts : stats?.recent_alerts ?? []).slice(0, 6).length > 0
            ? (latestAlerts.length > 0 ? latestAlerts : stats?.recent_alerts ?? []).slice(0, 6).map((a: any, i: number) => (
              <div key={i} className="alert-item">
                <div
                  className="alert-dot"
                  style={{
                    background: a.severity === 'CRITICAL' ? 'var(--critical)'
                      : a.severity === 'HIGH' ? 'var(--high)'
                        : a.severity === 'MEDIUM' ? 'var(--medium)'
                          : 'var(--low)'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {a.attack_type || 'Anomaly Detected'}
                    </span>
                    <span className={getBadgeClass(a.severity)}>{a.severity}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Sensor: <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{a.sensor}</span>
                    {' · '}{formatTime(a.timestamp)}
                  </div>
                </div>
              </div>
            ))
            : <div className="empty-state"><p>No alerts yet</p></div>
          }
        </div>

        {/* Alert Severity Distribution */}
        <div className="card">
          <div className="card-title">
            <BarChart2 size={14} className="text-cyan" />
            Alert Severity Distribution
          </div>
          {stats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(stats.alert_counts).map(([sev, count]) => {
                const maxCount = Math.max(...Object.values(stats.alert_counts), 1)
                const pct = (count / maxCount) * 100
                const colors: Record<string, string> = {
                  CRITICAL: 'var(--critical)', HIGH: 'var(--high)',
                  MEDIUM: 'var(--medium)', LOW: 'var(--low)'
                }
                return (
                  <div key={sev}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: colors[sev], fontWeight: 600 }}>{sev}</span>
                      <span className="mono" style={{ color: 'var(--text-muted)' }}>{count}</span>
                    </div>
                    <div className="score-bar" style={{ height: 6 }}>
                      <div
                        className="score-fill"
                        style={{ width: `${pct}%`, background: colors[sev] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="divider" />
          <div className="card-title" style={{ marginBottom: 8 }}>
            <Clock size={14} className="text-cyan" />
            Recent Detections
          </div>
          <div className="scroll-list" style={{ maxHeight: 200 }}>
            {(stats?.recent_detections ?? []).slice(0, 8).map((d, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 0', borderBottom: '1px solid rgba(30,45,69,0.5)'
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: d.is_anomaly ? 'var(--danger)' : 'var(--success)'
                }} />
                <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 11, width: 60 }}>
                  {d.sensor}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1 }}>
                  {d.value?.toFixed(3)}
                </span>
                <span style={{
                  fontSize: 11, color: d.is_anomaly ? 'var(--danger)' : 'var(--text-muted)'
                }}>
                  {d.anomaly_score?.toFixed(3)}
                </span>
              </div>
            ))}
            {(stats?.recent_detections ?? []).length === 0 && (
              <div className="empty-state" style={{ padding: 20 }}>
                <p>No detections yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
