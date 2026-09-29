/**
 * Simulated Data Flow — animated visual showing where traffic is "going"
 * before vs after the simulated execution. Purely illustrative: there is
 * no real traffic here, nothing is being captured or measured — the whole
 * scene is synthetic, driven by the same incident data as everything else
 * in Demo Mode. Labeled SIMULATED throughout so it's never mistaken for a
 * real packet-flow measurement.
 */
import { useEffect, useState } from 'react'

const DOT_COUNT = 5

export default function SimulatedDataFlow({ incident, restored, halves }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 50)
    return () => clearInterval(t)
  }, [])

  const badColor  = '#ff2d55'
  const goodColor = '#30d158'
  const color     = restored ? goodColor : badColor

  const sourceLabel = 'Global users'
  const midLabel     = restored ? (incident.victim?.name ?? 'Legitimate route') : (incident.attacker?.name ?? 'Hijacker')
  const midAsn        = restored ? incident.victim?.asn : incident.attacker?.asn
  const destLabel     = incident.victim?.name ?? 'Victim'
  const routeLabel    = restored ? (halves ? `${halves[0]} / ${halves[1]}` : incident.prefix) : incident.prefix

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 4, marginBottom: 10,
      background: restored ? 'rgba(48,209,88,0.05)' : 'rgba(255,45,85,0.05)',
      border: `1px solid ${restored ? 'rgba(48,209,88,0.3)' : 'rgba(255,45,85,0.3)'}`,
      transition: 'background 0.4s, border-color 0.4s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, letterSpacing: 1, color }}>
          🎬 SIMULATED DATA FLOW
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color }}>
          {restored ? '✓ RESTORED' : '⚠ HIJACKED'}
        </span>
      </div>

      {/* Flow diagram: SOURCE -> MID (hijacker or legit) -> DEST */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <FlowNode label={sourceLabel} sub="Origin" />
        <FlowPath color={color} tick={tick} reverse={!restored} />
        <FlowNode label={midLabel} sub={midAsn} highlight={color} />
        <FlowPath color={color} tick={tick} offset={2} />
        <FlowNode label={destLabel} sub={incident.victim?.asn} dim={!restored} />
      </div>

      <div style={{
        marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 7.5, color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        {restored
          ? <>Route now advertised as <span style={{ color: goodColor }}>{routeLabel}</span> — no real traffic exists in this
              demo; this illustrates the routing outcome the generated countermeasures would produce.</>
          : <>Route currently advertised as <span style={{ color: badColor }}>{routeLabel}</span> via the hijacker's AS path —
              illustrative only, no real packets are being captured or shown.</>
        }
      </div>
    </div>
  )
}

function FlowNode({ label, sub, highlight, dim }) {
  return (
    <div style={{
      flexShrink: 0, textAlign: 'center', padding: '6px 8px', borderRadius: 4, minWidth: 64,
      background: highlight ? `${highlight}18` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${highlight ?? 'var(--border-subtle)'}`,
      opacity: dim ? 0.5 : 1, transition: 'all 0.4s',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, color: 'var(--text-primary)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>
        {label}
      </div>
      {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 6.5, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function FlowPath({ color, tick, reverse = false, offset = 0 }) {
  return (
    <div style={{ flex: 1, height: 20, position: 'relative', minWidth: 30 }}>
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: 1.5,
        background: `${color}33`, transform: 'translateY(-50%)',
      }} />
      {Array.from({ length: DOT_COUNT }).map((_, i) => {
        const phase = ((tick + offset * 10) / 100 + i / DOT_COUNT) % 1
        const pos = reverse ? 1 - phase : phase
        return (
          <div key={i} style={{
            position: 'absolute', top: '50%', left: `${pos * 100}%`,
            width: 4, height: 4, borderRadius: '50%', background: color,
            transform: 'translate(-50%,-50%)', boxShadow: `0 0 4px ${color}`,
          }} />
        )
      })}
    </div>
  )
}
