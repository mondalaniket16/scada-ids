import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

interface User {
  id: number
  username: string
  email: string
  role: 'admin' | 'analyst' | 'viewer'
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  isAdmin: boolean
  isAnalyst: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('scada_token'))

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      // Verify token is still valid
      axios.get('/api/auth/me').then(res => {
        setUser(res.data)
      }).catch(() => {
        setToken(null)
        setUser(null)
        localStorage.removeItem('scada_token')
        delete axios.defaults.headers.common['Authorization']
      })
    }
  }, [token])

  const login = useCallback(async (username: string, password: string) => {
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)

    const res = await axios.post('/api/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    const { access_token, user: userData } = res.data
    setToken(access_token)
    setUser(userData)
    localStorage.setItem('scada_token', access_token)
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('scada_token')
    delete axios.defaults.headers.common['Authorization']
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin',
      isAnalyst: user?.role === 'admin' || user?.role === 'analyst',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
