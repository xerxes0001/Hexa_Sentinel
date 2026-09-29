import { useEffect, useRef } from 'react'
import { useSHYENStore } from '../../store/useSHYENStore.js'

const LEVELS = {
  ACTION: { color: 'var(--accent-blue)', bg: 'rgba(0,191,255,0.08)' },
  INFO: { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.035)' },
  SUCCESS: { color: 'var(--accent-green)', bg: 'rgba(0,255,136,0.08)' },
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function ActivityLog() {
  const entries = useSHYENStore(s => s.activityLog)
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [entries.length])

  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 4,
      background: 'rgba(10,15,25,0.45)',
      marginBottom: 16,
    }}>
      <div style={{
        height: 34,
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>
          ACTIVITY LOG
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-green)', boxShadow: '0 0 7px var(--accent-green)', animation: 'dotBounce 1.4s ease-in-out infinite' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--accent-green)', letterSpacing: '0.1em' }}>LIVE</span>
        </div>
      </div>

      <div ref={ref} style={{ maxHeight: 190, overflowY: 'auto', padding: 8 }}>
        {entries.map(entry => {
          const level = LEVELS[entry.level] ?? LEVELS.INFO
          return (
            <div key={entry.id} style={{
              display: 'grid',
              gridTemplateColumns: '58px 64px 1fr',
              gap: 8,
              alignItems: 'baseline',
              padding: '6px 7px',
              borderBottom: '1px solid rgba(255,255,255,0.035)',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{timeLabel(entry.timestamp)}</span>
              <span style={{
                color: level.color,
                background: level.bg,
                border: `1px solid ${level.color}33`,
                borderRadius: 2,
                padding: '1px 5px',
                textAlign: 'center',
                fontWeight: 700,
              }}>
                {entry.level}
              </span>
              <span style={{ color: entry.level === 'INFO' ? 'var(--text-secondary)' : 'var(--text-primary)', lineHeight: 1.45 }}>
                {entry.message}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
