import { useEffect, useRef, useCallback, useState } from 'react'

export interface TelemetryMessage {
  type: 'telemetry' | 'alert' | 'pong'
  timestamp: string
  sensor?: string
  value?: number
  unit?: string
  anomaly_score?: number
  status?: string
  is_anomaly?: boolean
  severity?: string
  scenario?: string
  attack_type?: string
}

interface UseWebSocketReturn {
  messages: TelemetryMessage[]
  latestBySensor: Record<string, TelemetryMessage>
  latestAlerts: TelemetryMessage[]
  connected: boolean
  clearMessages: () => void
}


export const getWsUrl = (path: string = '/ws/telemetry') => {
  if (import.meta.env.PROD) {
    return `wss://scada-ids.onrender.com${path}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}


export function useWebSocket(url: string = getWsUrl()): UseWebSocketReturn {
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<TelemetryMessage[]>([])
  const [latestBySensor, setLatestBySensor] = useState<Record<string, TelemetryMessage>>({})
  const [latestAlerts, setLatestAlerts] = useState<TelemetryMessage[]>([])
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    try {
      ws.current = new WebSocket(url)

      ws.current.onopen = () => {
        setConnected(true)
        // Send ping every 30s to keep alive
        pingInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30000)
      }

      ws.current.onmessage = (event) => {
        try {
          const msg: TelemetryMessage = JSON.parse(event.data)
          if (msg.type === 'pong') return

          if (msg.type === 'telemetry' && msg.sensor) {
            setLatestBySensor(prev => ({ ...prev, [msg.sensor!]: msg }))
            setMessages(prev => {
              const next = [msg, ...prev]
              return next.slice(0, 200) // keep last 200
            })
          } else if (msg.type === 'alert') {
            setLatestAlerts(prev => {
              const next = [msg, ...prev]
              return next.slice(0, 50)
            })
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      ws.current.onclose = () => {
        setConnected(false)
        if (pingInterval.current) clearInterval(pingInterval.current)
        // Reconnect after 3 seconds
        reconnectTimeout.current = setTimeout(connect, 3000)
      }

      ws.current.onerror = () => {
        ws.current?.close()
      }
    } catch (e) {
      reconnectTimeout.current = setTimeout(connect, 3000)
    }
  }, [url])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      if (pingInterval.current) clearInterval(pingInterval.current)
      ws.current?.close()
    }
  }, [connect])

  const clearMessages = useCallback(() => {
    setMessages([])
    setLatestAlerts([])
  }, [])

  return { messages, latestBySensor, latestAlerts, connected, clearMessages }
}
