import { useState, useEffect, useRef } from 'react'
import { INDIAN_ASNS } from '../../data/indianASNs.js'
import { FOREIGN_ASNS } from '../../data/foreignASNs.js'
import { SEVERITY_COLORS as SEV_COLOR } from '../../utils/severity.js'

const BREACH_TYPES = [
  { id: 'ORIGIN_HIJACK',     label: 'Origin Hijack',     icon: '⬡', severity: 'CRITICAL', desc: 'Foreign ASN claims full ownership of Indian prefix' },
  { id: 'SUBPREFIX_HIJACK',  label: 'Sub-prefix Hijack', icon: '◈', severity: 'HIGH',     desc: 'More-specific route injected to silently capture traffic' },
  { id: 'ROUTE_LEAK',        label: 'Route Leak',        icon: '⟳', severity: 'HIGH',     desc: 'Indian route propagating through unauthorized ASN path' },
  { id: 'PATH_MANIPULATION', label: 'Path Manipulation', icon: '↯', severity: 'MEDIUM',   desc: 'Attacker AS silently inserted into routing path' },
]

const SECTOR_COLORS = { Financial: '#ff2d55', Government: '#ffd60a', Defense: '#ff6b00', Telecom: '#00bfff', ISP: '#00ff88', IXP: '#bf5af2' }

function buildScript(breach, victim, attacker, prefix) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const prefixBits  = parseInt(prefix?.split('/')[1] ?? '24')
  const affectedIPs = Math.pow(2, 32 - prefixBits)
  const confidence  = breach.severity === 'CRITICAL' ? 95 : breach.severity === 'HIGH' ? 87 : 78
  const incidentId  = Math.floor(Math.random() * 9000) + 1000
  return [
    { t: '', c: '', d: 0 },
    { t: 'HexaSentinel v2.0 — ON-DEVICE NPU THREAT INTELLIGENCE', c: '#00ff88', bold: true, d: 0 },
    { t: 'HexaSentinel On-Device AI · Llama 3.2 3B (Qualcomm AI Hub) · Hexagon NPU', c: '#4d8a63', d: 60 },
    { t: '', d: 80 },
    { t: '────────────────────────────────────────────────────────────', c: '#2f3a48', d: 60 },
    { t: `[${ts} UTC]  ANOMALY STREAM ACTIVE — monitoring ${INDIAN_ASNS.length} Indian ASNs`, c: '#7c8697', d: 80 },
    { t: `[${ts} UTC]  Vantage feed: RIPE-RIS-01, RouteViews-Oregon, RIPE-RIS-10...`, c: '#7c8697', d: 100 },
    { t: '', d: 200 },
    { t: `[${ts} UTC]  BGP UPDATE RECEIVED`, c: '#8b96a4', d: 80 },
    { t: `[${ts} UTC]  Origin AS: ${attacker.asn} (${attacker.name})`, c: '#8b96a4', d: 80 },
    { t: `[${ts} UTC]  Announced Prefix: ${prefix}`, c: '#8b96a4', d: 80 },
    { t: `[${ts} UTC]  AS_PATH: ${attacker.asn} 174 3356 ${victim.asn}`, c: '#8b96a4', d: 100 },
    { t: '', d: 180 },
    { t: `[${ts} UTC]  DETECTION: registered origin -> ${victim.asn} (${victim.name})`, c: '#8b96a4', d: 100 },
    { t: `[${ts} UTC]  DETECTION: received origin  -> ${attacker.asn} [${attacker.country}]`, c: '#ff6b00', d: 100 },
    { t: `[${ts} UTC]  DETECTION: MISMATCH CONFIRMED`, c: '#ff2d55', bold: true, d: 120 },
    { t: '', d: 160 },
    { t: `[${ts} UTC]  VALIDATION: cross-checking 8 global vantage points...`, c: '#8b96a4', d: 100 },
    { t: `[${ts} UTC]  RIPE-RIS-01 Amsterdam .............. CONFIRMED`, c: '#00ff88', d: 80 },
    { t: `[${ts} UTC]  RouteViews Oregon .................. CONFIRMED`, c: '#00ff88', d: 80 },
    { t: `[${ts} UTC]  RIPE-RIS-04 Geneva ................. CONFIRMED`, c: '#00ff88', d: 80 },
    { t: `[${ts} UTC]  RouteViews Tokyo ................... CONFIRMED`, c: '#00ff88', d: 80 },
    { t: `[${ts} UTC]  RIPE-RIS-10 Singapore .............. CONFIRMED`, c: '#00ff88', d: 80 },
    { t: `[${ts} UTC]  RouteViews Sydney .................. CONFIRMED`, c: '#00ff88', d: 80 },
    { t: `[${ts} UTC]  RIPE-RIS-11 New York ............... CONFIRMED`, c: '#00ff88', d: 80 },
    { t: `[${ts} UTC]  RouteViews Sao Paulo ............... CONFIRMED`, c: '#00ff88', d: 80 },
    { t: '', d: 140 },
    { t: `[${ts} UTC]  CONFIDENCE: ${confidence}%  VANTAGE: 8/8  ATTACK: ${breach.id}`, c: '#ffd60a', d: 100 },
    { t: `[${ts} UTC]  AFFECTED IPs: ~${affectedIPs.toLocaleString()}  SECTOR: ${victim.sector}`, c: '#ffd60a', d: 80 },
    { t: '', d: 200 },
    { t: '────────────────────────────────────────────────────────────', c: '#ff2d55', d: 60 },
    { t: '', d: 40 },
    { t: '  BREACH BREACH BREACH BREACH BREACH BREACH BREACH BREACH', c: '#ff2d55', bold: true, d: 30 },
    { t: `  ${breach.severity} INCIDENT CONFIRMED`, c: '#ff2d55', bold: true, d: 40 },
    { t: `  ${breach.label.toUpperCase()} DETECTED`, c: '#ff2d55', bold: true, d: 40 },
    { t: '', d: 40 },
    { t: '────────────────────────────────────────────────────────────', c: '#ff2d55', d: 60 },
    { t: '', d: 80 },
    { t: `  TARGET      ${victim.name} (${victim.asn})`, c: '#e8e8e8', bold: true, d: 60 },
    { t: `  SECTOR      ${victim.sector}`, c: '#888', d: 50 },
    { t: `  PREFIX      ${prefix}`, c: '#888', d: 50 },
    { t: `  ATTACKER    ${attacker.asn} — ${attacker.name} [${attacker.country}]`, c: '#ff6b00', d: 50 },
    { t: `  IPs HIT     ~${affectedIPs.toLocaleString()} addresses`, c: '#888', d: 50 },
    { t: `  CONFIDENCE  ${confidence}% (8/8 vantage points)`, c: '#888', d: 50 },
    { t: '', d: 100 },
    { t: `  ${breach.desc}`, c: '#9aa5b1', d: 60 },
    { t: '', d: 120 },
    { t: '────────────────────────────────────────────────────────────', c: '#2f3a48', d: 60 },
    { t: '', d: 80 },
    { t: '[AUTONOMOUS RESPONSE PIPELINE INITIATED]', c: '#00bfff', bold: true, d: 100 },
    { t: '', d: 60 },
    { t: `  -> Generating RPKI ROA invalidation record...`, c: '#7c8697', d: 220 },
    { t: `  OK ROA generated for ${prefix} — authorized: ${victim.asn}`, c: '#00ff88', d: 280 },
    { t: '', d: 60 },
    { t: `  -> Preparing IXP filter rules for all NIXI nodes...`, c: '#7c8697', d: 220 },
    { t: `  OK Filter pushed — NIXI Mumbai, Delhi, Chennai, Kolkata`, c: '#00ff88', d: 280 },
    { t: '', d: 60 },
    { t: `  -> Compiling forensic evidence bundle...`, c: '#7c8697', d: 220 },
    { t: `  OK Forensic package ready — formatted for CERT-In submission`, c: '#00ff88', d: 280 },
    { t: '', d: 60 },
    { t: `  -> Dispatching alert to CERT-In NOC...`, c: '#7c8697', d: 220 },
    { t: `  OK Alert sent — cert-in@cert-in.org.in`, c: '#00ff88', d: 280 },
    { t: '', d: 120 },
    { t: '────────────────────────────────────────────────────────────', c: '#2f3a48', d: 60 },
    { t: `[${ts} UTC]  INCIDENT #${incidentId} LOGGED — STATUS: UNDER MITIGATION`, c: '#ffd60a', d: 80 },
    { t: `[${ts} UTC]  HexaSentinel NPU monitoring all ${INDIAN_ASNS.length} Indian ASNs...`, c: '#7c8697', d: 80 },
    { t: '', d: 200 },
    { t: 'Press any key or click DISMISS to return to dashboard', c: '#00ff88', blink: true, d: 0 },
  ]
}

function TerminalOverlay({ breach, victim, attacker, prefix, onDismiss }) {
  const [lines, setLines] = useState([])
  const [done,  setDone]  = useState(false)
  const scrollRef         = useRef(null)
  const script            = useRef(buildScript(breach, victim, attacker, prefix))

  useEffect(() => {
    let i = 0, timeout
    function next() {
      if (i >= script.current.length) { setDone(true); return }
      const line = script.current[i++]
      setLines(prev => [...prev, line])
      timeout = setTimeout(next, line.d ?? 60)
    }
    timeout = setTimeout(next, 200)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [lines])

  useEffect(() => {
    const fn = () => { if (done) onDismiss() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [done, onDismiss])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.98)', display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono','Courier New',monospace" }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #111', background: '#060606', zIndex: 2, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff2d55', boxShadow: '0 0 5px #ff2d55' }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffd60a' }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#30d158' }} />
          <span style={{ fontSize: 10, color: '#6b7686', marginLeft: 12, letterSpacing: '0.1em' }}>hexasentinel@hexagon-npu — breach-terminal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.2)', borderRadius: 3, padding: '3px 10px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff2d55', animation: 'termBlink 0.8s ease infinite' }} />
            <span style={{ fontSize: 9, color: '#ff2d55', letterSpacing: '0.12em' }}>BREACH DETECTED</span>
          </div>
          {done && <button onClick={onDismiss} style={{ fontFamily: 'inherit', fontSize: 9, color: '#8b96a4', background: 'transparent', border: '1px solid #3a4452', borderRadius: 3, padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.1em' }}>DISMISS x</button>}
        </div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 40px', position: 'relative', zIndex: 2 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ lineHeight: 1.75, minHeight: '1.75em', whiteSpace: 'pre', fontSize: line.bold ? 11.5 : 10.5, color: line.c || '#8b96a4', fontWeight: line.bold ? 700 : 400, textShadow: line.c === '#ff2d55' ? '0 0 8px rgba(255,45,85,0.35)' : line.c === '#00ff88' ? '0 0 5px rgba(0,255,136,0.25)' : 'none', animation: line.blink ? 'termBlink 1.2s ease infinite' : 'none' }}>{line.t}</div>
        ))}
        {!done && <div style={{ display: 'inline-block', width: 7, height: 13, background: '#00ff88', animation: 'termBlink 1s ease infinite', verticalAlign: 'middle', marginLeft: 2 }} />}
      </div>
      <style>{`@keyframes termBlink{0%,100%{opacity:1}50%{opacity:0}}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#111}`}</style>
    </div>
  )
}

function StepLabel({ n, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 8, color: '#ff2d55', fontWeight: 700, letterSpacing: '0.08em' }}>{n}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
      <span style={{ fontSize: 8, color: '#a3aebb', letterSpacing: '0.14em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
    </div>
  )
}

export default function BreachSimulator({ onClose, onIncidentGenerated }) {
  const [breach,   setBreach]   = useState(null)
  const [victim,   setVictim]   = useState(null)
  const [attacker, setAttacker] = useState(null)
  const [terminal, setTerminal] = useState(null)
  const ready = breach && victim && attacker

  function launch() {
    if (!ready) return
    const v = INDIAN_ASNS.find(a => a.asn === victim)
    const a = FOREIGN_ASNS.find(a => a.asn === attacker)
    const b = BREACH_TYPES.find(b => b.id === breach)
    const prefix = v.prefixes[Math.floor(Math.random() * v.prefixes.length)]
    setTerminal({ breach: b, victim: v, attacker: a, prefix })
  }

  // Quick demo — pre-configured CRITICAL Origin Hijack on NPCI/UPI from China Telecom
  function quickDemo() {
    const v = INDIAN_ASNS.find(a => a.asn === 'AS55655')   // NPCI / UPI
    const a = FOREIGN_ASNS.find(a => a.asn === 'AS4134')   // China Telecom
    const b = BREACH_TYPES.find(b => b.id === 'ORIGIN_HIJACK')
    const prefix = v.prefixes[0]
    setTerminal({ breach: b, victim: v, attacker: a, prefix })
  }

  if (terminal) return <TerminalOverlay {...terminal} onDismiss={() => { setTerminal(null); if (onIncidentGenerated && terminal) { const inc = { type: terminal.breach.id, severity: terminal.breach.severity, victim: terminal.victim, attacker: terminal.attacker, prefix: terminal.prefix, confirmedPoints: ["RIPE-RIS-01 Amsterdam","RouteViews Oregon","RIPE-RIS-04 Geneva","RouteViews Tokyo","RIPE-RIS-10 Singapore","RouteViews Sydney","RIPE-RIS-11 New York","RouteViews Sao Paulo"], timestamp: new Date(), affectedIPs: (() => { const b = parseInt(terminal.prefix?.split('/')[1] ?? '24'); return Math.pow(2, 32 - b) })(), confidence: terminal.breach.severity === 'CRITICAL' ? 95 : terminal.breach.severity === 'HIGH' ? 87 : 78, isSimulated: true, isRealData: false }; onIncidentGenerated(inc); } onClose(); }} />

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: 660, maxHeight: '90vh', overflowY: 'auto', background: '#060b10', border: '1px solid rgba(255,45,85,0.18)', borderRadius: 8, padding: '28px 28px 24px', boxShadow: '0 0 60px rgba(255,45,85,0.06)' }}>
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 9, color: '#ff2d55', letterSpacing: '0.18em', marginBottom: 6 }}>HEXASENTINEL NPU MONITOR</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1 }}>Breach Simulator</div>
            <div style={{ fontSize: 9, color: '#8b96a4', marginTop: 6 }}>Configure attack parameters — terminal fires on launch</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.5)', color: '#ff2d55', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', boxShadow: '0 0 8px rgba(255,45,85,0.35)', letterSpacing: 1 }}>✕ CLOSE</button>
        </div>

        {/* Quick Demo button — guaranteed CRITICAL wow moment */}
        <button onClick={quickDemo} style={{
          width: '100%', marginBottom: 20,
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.12em', color: '#fff',
          background: 'linear-gradient(135deg, #ff2d55, #ff6b00)',
          border: 'none', borderRadius: 5, padding: '12px 0', cursor: 'pointer',
          boxShadow: '0 0 24px rgba(255,45,85,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          ⚡ QUICK DEMO — CRITICAL Origin Hijack on NPCI/UPI from China Telecom
        </button>
        <div style={{ textAlign: 'center', fontSize: 8, color: '#8b96a4', marginBottom: 20, marginTop: -12, letterSpacing: '0.05em' }}>
          One-click guaranteed scenario · or configure manually below
        </div>

        <StepLabel n="01" label="SELECT BREACH TYPE" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 24 }}>
          {BREACH_TYPES.map(b => {
            const sel = breach === b.id; const sc = SEV_COLOR[b.severity]
            return (
              <div key={b.id} onClick={() => setBreach(b.id)} style={{ border: `1px solid ${sel ? sc + '80' : 'rgba(255,255,255,0.06)'}`, background: sel ? sc + '0d' : 'rgba(255,255,255,0.01)', borderRadius: 5, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <span style={{ fontSize: 14, color: sel ? sc : '#5c6773' }}>{b.icon}</span>
                  <span style={{ fontSize: 9, color: sel ? sc : '#9aa5b1', letterSpacing: '0.08em', fontWeight: 700 }}>{b.label.toUpperCase()}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 8, color: sc, border: `1px solid ${sc}44`, borderRadius: 2, padding: '1px 4px' }}>{b.severity}</span>
                </div>
                <div style={{ fontSize: 9, color: sel ? '#c3ccd6' : '#8b96a4', lineHeight: 1.5 }}>{b.desc}</div>
              </div>
            )
          })}
        </div>

        <StepLabel n="02" label="SELECT TARGET ASN" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 24 }}>
          {INDIAN_ASNS.map(asn => {
            const sel = victim === asn.asn; const sc = SECTOR_COLORS[asn.sector]
            return (
              <div key={asn.asn} onClick={() => setVictim(asn.asn)} style={{ border: `1px solid ${sel ? sc + '80' : 'rgba(255,255,255,0.05)'}`, background: sel ? sc + '0d' : 'rgba(255,255,255,0.01)', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', transition: 'all 0.15s' }}>
                <div style={{ fontSize: 8, color: sel ? sc : '#7c8697' }}>{asn.asn}</div>
                <div style={{ fontSize: 10, color: sel ? '#ddd' : '#a3aebb', fontWeight: sel ? 600 : 400 }}>{asn.name}</div>
                <div style={{ fontSize: 8, color: sel ? sc : '#6b7686', marginTop: 1 }}>{asn.sector}</div>
              </div>
            )
          })}
        </div>

        <StepLabel n="03" label="SELECT ATTACKER ORIGIN" />
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
          {FOREIGN_ASNS.map(asn => {
            const sel = attacker === asn.asn
            const hostile = asn.country === 'CN' || asn.country === 'PK'
            const sc = hostile ? '#ff6b00' : '#9aa5b1'
            const flag = { CN: 'CN', PK: 'PK', EG: 'EG', DE: 'DE', IT: 'IT', US: 'US', AU: 'AU', JP: 'JP' }[asn.country] || '--'
            return (
              <div key={asn.asn} onClick={() => setAttacker(asn.asn)} style={{ border: `1px solid ${sel ? sc + '80' : 'rgba(255,255,255,0.05)'}`, background: sel ? sc + '0d' : 'rgba(255,255,255,0.01)', borderRadius: 4, padding: '8px 12px', cursor: 'pointer', transition: 'all 0.15s', flex: 1, minWidth: 90, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: sel ? sc : '#a3aebb', fontWeight: 700, marginBottom: 4 }}>[{flag}]</div>
                <div style={{ fontSize: 8, color: sel ? sc : '#7c8697' }}>{asn.asn}</div>
                <div style={{ fontSize: 9, color: sel ? '#ddd' : '#a3aebb', fontWeight: sel ? 600 : 400 }}>{asn.name}</div>
              </div>
            )
          })}
        </div>

        <button onClick={launch} disabled={!ready} style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', color: ready ? '#000' : '#7c8697', background: ready ? '#ff2d55' : 'rgba(255,255,255,0.02)', border: `1px solid ${ready ? '#ff2d55' : 'rgba(255,255,255,0.04)'}`, borderRadius: 5, padding: '13px 0', cursor: ready ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: ready ? '0 0 20px rgba(255,45,85,0.25)' : 'none' }}>
          {ready ? 'SIMULATE BREACH' : '— SELECT ALL THREE TO CONTINUE —'}
        </button>
        {ready && <div style={{ marginTop: 10, textAlign: 'center', fontSize: 9, color: '#7c8697' }}>Terminal fires on launch — press any key or DISMISS to return</div>}
      </div>
    </div>
  )
}
