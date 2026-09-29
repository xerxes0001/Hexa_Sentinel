/**
 * Admin Chat panel wrapper — full-screen overlay matching the style of
 * RouteMonitorPanel / AttackHistoryPanel / RPKIGapPanel.
 * AdminChat.jsx itself was fully built (real Groq integration) but was
 * never mounted anywhere in the app — this wires it in.
 */
import AdminChat from '../chat/AdminChat.jsx'

export default function AdminChatPanel({ onClose }) {
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(4,7,14,0.97)',
      display:'flex', flexDirection:'column',
      animation:'fadeIn 0.2s ease-out',
    }}>
      <div style={{
        position:'sticky', top:0, background:'rgba(4,7,14,0.98)', borderBottom:'1px solid var(--border-subtle)',
        padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:10, flexShrink:0,
      }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800 }}>ADMIN AI ASSISTANT</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Ask about current threats, RPKI, CERT-In procedures, or Indian ISP topology
          </div>
        </div>
        <button onClick={onClose} style={{
          fontFamily:'var(--font-mono)', fontSize:9, color:'#ff2d55',
          background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.45)',
          borderRadius:4, padding:'6px 14px', cursor:'pointer', boxShadow:'0 0 8px rgba(255,45,85,0.3)',
        }}>✕ CLOSE</button>
      </div>
      <div style={{ flex:1, minHeight:0, padding:'20px 24px', maxWidth:800, width:'100%', margin:'0 auto', display:'flex' }}>
        <AdminChat />
      </div>
    </div>
  )
}
