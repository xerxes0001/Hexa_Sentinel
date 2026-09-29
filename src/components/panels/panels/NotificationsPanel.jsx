/**
 * Notifications Panel — slide-in from top-right
 * Shows AI decisions, anomaly alerts, RPKI results, country resolutions
 */
import { useSHYENStore } from '../../store/useSHYENStore.js'

export default function NotificationsPanel({ onClose }) {
  const notifications      = useSHYENStore(s => s.notifications)
  const activityLog        = useSHYENStore(s => s.activityLog)
  const dismissNotification = useSHYENStore(s => s.dismissNotification)

  const LEVEL_COLOR = { SUCCESS:'#30d158', INFO:'#00bfff', ACTION:'#ff6b00', WARNING:'#ffd60a' }

  return (
    <div style={{
      position:'fixed', top:64, right:16, width:360, maxHeight:'70vh',
      background:'rgba(6,10,18,0.98)', border:'1px solid var(--border-subtle)',
      borderRadius:8, zIndex:200, display:'flex', flexDirection:'column',
      boxShadow:'0 8px 40px rgba(0,0,0,0.6)', animation:'slideInRight 0.2s ease-out',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:700 }}>NOTIFICATIONS</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {notifications.length > 0 && (
            <button onClick={() => notifications.forEach(n => dismissNotification(n.id))} style={{
              fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)',
              background:'none', border:'1px solid var(--border-subtle)', borderRadius:2,
              padding:'2px 8px', cursor:'pointer',
            }}>CLEAR ALL</button>
          )}
          <button onClick={onClose} style={{ background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.45)', color:'#ff2d55', cursor:'pointer', fontSize:14, borderRadius:4, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 8px rgba(255,45,85,0.3)' }}>✕</button>
        </div>
      </div>

      {/* Live alerts */}
      {notifications.length > 0 && (
        <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--border-subtle)' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#ffd60a', letterSpacing:'0.1em', marginBottom:6 }}>
            ● LIVE ALERTS ({notifications.length})
          </div>
          {notifications.map(n => (
            <div key={n.id} style={{
              padding:'8px 10px', marginBottom:4, borderRadius:4,
              background: n.isAlert ? 'rgba(255,214,10,0.06)' : 'rgba(0,191,255,0.06)',
              border:`1px solid ${n.isAlert ? 'rgba(255,214,10,0.2)' : 'rgba(0,191,255,0.2)'}`,
              display:'flex', justifyContent:'space-between', alignItems:'flex-start',
            }}>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color: n.isAlert ? '#ffd60a' : '#00bfff', marginBottom:3 }}>
                  {n.isAlert ? '⚠ ANOMALY ALERT' : '◈ AI ACTION'}
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-secondary)', lineHeight:1.5 }}>{n.text}</div>
              </div>
              <button onClick={() => dismissNotification(n.id)} style={{
                background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.25)', color:'rgba(255,255,255,0.9)', cursor:'pointer', fontSize:11, flexShrink:0, marginLeft:8, borderRadius:3, width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 6px rgba(255,255,255,0.1)',
              }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Activity log */}
      <div style={{ flex:1, overflowY:'auto', padding:'8px 12px' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:8 }}>
          ACTIVITY LOG ({activityLog.length})
        </div>
        {[...activityLog].reverse().map(entry => (
          <div key={entry.id} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'flex-start' }}>
            <span style={{
              fontFamily:'var(--font-mono)', fontSize:7, fontWeight:700,
              color: LEVEL_COLOR[entry.level] ?? '#888',
              background:`${LEVEL_COLOR[entry.level] ?? '#888'}18`,
              border:`1px solid ${LEVEL_COLOR[entry.level] ?? '#888'}33`,
              borderRadius:2, padding:'1px 4px', flexShrink:0, marginTop:1,
            }}>{entry.level}</span>
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-secondary)', lineHeight:1.5 }}>{entry.message}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'var(--text-muted)' }}>
                {new Date(entry.timestamp).toISOString().slice(11,19)} UTC
              </div>
            </div>
          </div>
        ))}
        {activityLog.length === 0 && (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', textAlign:'center', padding:20 }}>
            No activity yet
          </div>
        )}
      </div>
    </div>
  )
}
