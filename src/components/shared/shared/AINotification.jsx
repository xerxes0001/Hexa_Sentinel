/**
 * AI Notification Toast
 * Shows for both autonomous decisions (green) and anomaly alerts (amber)
 */
import { useEffect } from 'react'
import { useSHYENStore } from '../../store/useSHYENStore.js'

const ACTION_LABELS = {
  PUSH_RPKI:  '✓ RPKI invalidation pushed autonomously',
  ALERT_IXP:  '✓ IXP filter alert sent autonomously',
  FORENSICS:  '✓ Forensics package compiled autonomously',
  MONITOR:    '● Monitoring — no autonomous action required',
}

export default function AINotification() {
  const notifications       = useSHYENStore(s => s.notifications)
  const dismissNotification = useSHYENStore(s => s.dismissNotification)

  useEffect(() => {
    if (notifications.length === 0) return
    const latest = notifications[0]
    const t = setTimeout(() => dismissNotification(latest.id), 6000)
    return () => clearTimeout(t)
  }, [notifications.length])

  if (notifications.length === 0) return null
  const n = notifications[0]

  const isAlert   = n.isAlert
  const borderColor = isAlert ? '#ffd60a' : '#00bfff'
  const labelColor  = isAlert ? '#ffd60a' : '#00bfff'
  const title       = isAlert ? '⚠ HexaSentinel NPU — ANOMALY ALERT' : '◈ HexaSentinel NPU — AUTONOMOUS ACTION'

  return (
    <div style={{
      position: 'fixed', bottom: 40, right: 20, zIndex: 300,
      background: 'rgba(0,10,20,0.96)',
      border: `1px solid ${borderColor}44`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 4, padding: '10px 14px', width: 300,
      animation: 'slideInRight 0.3s ease-out',
      boxShadow: `0 0 20px ${borderColor}18`,
    }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:labelColor, letterSpacing:'0.12em', marginBottom:5 }}>
        {title}
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'#aaa', lineHeight:1.6 }}>
        {n.text}
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color: isAlert ? '#ffd60a' : '#00ff88', marginTop:4 }}>
        {ACTION_LABELS[n.action] ?? n.action}
      </div>
      {isAlert && (
        <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginTop:3 }}>
          → RPKI push suggested — review safeguards in detail panel
        </div>
      )}
      <style>{`@keyframes slideInRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}
