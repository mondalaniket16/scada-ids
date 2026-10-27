import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Shield, AlertTriangle } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
    } catch (err: any) {
      if (err?.response?.data?.detail) {
        setError(err.response.data.detail)
      } else if (err?.response?.status >= 500 || err?.code === 'ERR_NETWORK' || !err?.response) {
        setError('Cannot connect to backend server. Please verify backend is running.')
      } else {
        setError('Login failed. Check credentials.')
      }
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (user: string, pass: string) => {
    setUsername(user)
    setPassword(pass)
  }

  return (
    <div className="login-container">
      <div className="login-bg-grid" />

      {/* Decorative elements */}
      <div style={{
        position: 'absolute', top: '20%', left: '10%', opacity: 0.05,
        fontSize: 200, color: '#06b6d4', pointerEvents: 'none'
      }}>⬡</div>
      <div style={{
        position: 'absolute', bottom: '20%', right: '10%', opacity: 0.05,
        fontSize: 200, color: '#3b82f6', pointerEvents: 'none'
      }}>⬡</div>

      <div className="login-card animate-fade-in">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 60, height: 60, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Shield size={28} color="#000" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            SCADA IDS
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Industrial Intrusion Detection System
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="input"
              type="text"
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="input"
              type="password"
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6, padding: '10px 12px', marginBottom: 16,
              color: 'var(--danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }}
          >
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Authenticating...</> : 'Sign In'}
          </button>
        </form>

        {/* Demo accounts */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Demo Accounts
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { role: 'Admin', user: 'admin', pass: 'Admin@123', color: '#06b6d4' },
              { role: 'Analyst', user: 'analyst', pass: 'Analyst@123', color: '#3b82f6' },
              { role: 'Viewer', user: 'viewer', pass: 'Viewer@123', color: '#94a3b8' },
            ].map(({ role, user, pass, color }) => (
              <button
                key={role}
                className="btn btn-secondary btn-sm"
                onClick={() => quickLogin(user, pass)}
                style={{ justifyContent: 'center', borderColor: color + '44', color }}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
