import { useState, useEffect } from 'react'
import { Activity, Filter} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useWebSocket } from '../hooks/useWebSocket'

const SENSORS = ['LIT101', 'FIT101', 'AIT201', 'AIT202', 'AIT203', 'FIT201', 'MV101', 'P101', 'P102']
const COLORS: Record<string, string> = {
  LIT101: '#06b6d4', FIT101: '#3b82f6', AIT201: '#14b8a6',
  AIT202: '#8b5cf6', AIT203: '#f59e0b', FIT201: '#10b981',
  MV101: '#f43f5e', P101: '#84cc16', P102: '#fb923c',
}

export default function TelemetryPage() {
  const [selectedSensors, setSelectedSensors] = useState<string[]>(['LIT101', 'FIT101', 'AIT201'])
  const [chartData, setChartData] = useState<any[]>([])
  const { messages, latestBySensor, connected } = useWebSocket()

  // Build multi-sensor chart data from WS messages
  useEffect(() => {
    const recent = messages.filter(m => m.type === 'telemetry' && selectedSensors.includes(m.sensor!)).slice(0, 100)
    // Group by time windows
    const byTime: Record<string, any> = {}
    recent.forEach(m => {
      const t = new Date(m.timestamp).toLocaleTimeString()
      if (!byTime[t]) byTime[t] = { time: t }
      byTime[t][m.sensor!] = m.value?.toFixed(3)
    })
    setChartData(Object.values(byTime).slice(-30))
  }, [messages, selectedSensors])

  const toggleSensor = (s: string) => {
    setSelectedSensors(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="section-header">
        <h2 className="section-title">
          <Activity size={18} className="text-cyan" />
          Live Telemetry Monitor
          <span style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 400 }}>
            <span className={`conn-dot ${connected ? 'connected' : 'disconnected'}`} />
            {connected ? 'Streaming' : 'Disconnected'}
          </span>
        </h2>
      </div>

      {/* Sensor selector */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Filter size={14} className="text-cyan" /> Sensor Selection</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SENSORS.map(s => (
            <button
              key={s}
              className={`btn btn-sm ${selectedSensors.includes(s) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleSensor(s)}
              style={{
                borderColor: selectedSensors.includes(s) ? COLORS[s] : undefined,
                background: selectedSensors.includes(s) ? COLORS[s] + '22' : undefined,
                color: selectedSensors.includes(s) ? COLORS[s] : undefined,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Multi-sensor chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Multi-Sensor Time Series</div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,45,69,0.8)" />
              <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 10 }} />
              <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              {selectedSensors.map(s => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stroke={COLORS[s]}
                  strokeWidth={2}
                  dot={false}
                  name={s}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state" style={{ height: 280 }}>
            <div className="empty-state-icon">📡</div>
            <p>Waiting for telemetry data...</p>
            <p style={{ marginTop: 8 }}>Start a simulation to see live sensor readings</p>
          </div>
        )}
      </div>

      {/* Current values grid */}
      <div className="card">
        <div className="card-title">Current Sensor Values</div>
        <div className="sensor-grid">
          {SENSORS.map(s => {
            const msg = latestBySensor[s]
            return (
              <div key={s} className={`sensor-card ${msg?.is_anomaly ? 'anomaly' : ''}`}>
                <div className="sensor-name">{s}</div>
                <div className="sensor-value" style={{ color: COLORS[s] }}>
                  {msg?.value?.toFixed(3) ?? '--'}
                </div>
                <div className="sensor-unit">{msg?.unit ?? 'N/A'}</div>
                {msg && (
                  <>
                    <div style={{ marginTop: 6 }}>
                      <div className="score-bar">
                        <div
                          className="score-fill"
                          style={{
                            width: `${(msg.anomaly_score ?? 0) * 100}%`,
                            background: msg.is_anomaly ? 'var(--danger)' : COLORS[s]
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                      Score: <span className="mono">{msg.anomaly_score?.toFixed(4)}</span>
                    </div>
                    {msg.is_anomaly && (
                      <div style={{ marginTop: 4 }}>
                        <span className={`badge badge-${msg.severity?.toLowerCase()}`} style={{ fontSize: 10 }}>
                          ⚠ {msg.severity}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
