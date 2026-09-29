/**
 * Execution Simulation — DEMO MODE ONLY.
 *
 * Shows the human-in-the-loop step SHYEN is honest about everywhere else:
 * a network engineer must authorize deployment before anything real would
 * happen. This panel lets you simulate that authorization for a demo
 * audience and then walks through what deployment would look like —
 * clearly and repeatedly labeled as simulated throughout, because SHYEN
 * has no real BGP session in demo mode OR live mode. This never renders
 * for a real (isRealData) incident — see the gate in DetailPanel.jsx.
 */
import { useState, useRef, useEffect } from 'react'
import { generateCountermeasures, splitPrefix } from '../../engine/countermeasureGenerator.js'
import SimulatedDataFlow from './SimulatedDataFlow.jsx'

const STEPS = [
  { key: 'roa',      label: 'Filing RPKI ROA with IRINN',              doneLabel: 'RPKI ROA filed' },
  { key: 'rtbh',     label: 'Pushing RTBH blackhole to IXP route servers', doneLabel: 'RTBH blackhole active' },
  { key: 'flowspec', label: 'Deploying BGP Flowspec rule',              doneLabel: 'Flowspec rule deployed' },
  { key: 'more',     label: 'Announcing more-specific prefix',          doneLabel: 'More-specific prefix announced' },
]
const MORE_SPECIFIC_STEP_INDEX = STEPS.findIndex(s => s.key === 'more')

export default function ExecutionSimulation({ incident }) {
  const [phase, setPhase]           = useState('idle') // idle | pending | executing | complete
  const [stepIndex, setStepIndex]   = useState(-1)
  const timeouts = useRef([])

  useEffect(() => () => timeouts.current.forEach(clearTimeout), [])

  const cm = generateCountermeasures(incident)
  const halves = splitPrefix(incident.prefix)

  // Traffic only actually "moves" once the more-specific announcement step
  // completes — that's the real mechanism (longest-prefix-match) that wins
  // the traffic back, so the flow visual should sync to that exact moment,
  // not just to "some steps happened."
  const restored = stepIndex >= MORE_SPECIFIC_STEP_INDEX

  function requestAuthorization() {
    setPhase('pending')
    timeouts.current.push(setTimeout(() => {
      setPhase('executing')
      STEPS.forEach((_, i) => {
        timeouts.current.push(setTimeout(() => setStepIndex(i), 700 * (i + 1)))
      })
      timeouts.current.push(setTimeout(() => setPhase('complete'), 700 * (STEPS.length + 1)))
    }, 1100))
  }

  function reset() {
    timeouts.current.forEach(clearTimeout)
    timeouts.current = []
    setPhase('idle')
    setStepIndex(-1)
  }

  return (
    <div>
      <div style={{
        padding: '9px 12px', marginBottom: 10,
        background: 'rgba(191,90,242,0.06)', border: '1px solid rgba(191,90,242,0.3)', borderRadius: 4,
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          🎬 <strong style={{ color: 'var(--accent-purple)' }}>SIMULATED — DEMO MODE ONLY.</strong> HexaSentinel has no real BGP
          session in demo or live mode; it cannot actually deploy anything or observe real traffic. Everything below —
          including the data flow diagram — is illustrative, driven entirely by this demo incident's synthetic data.
        </div>
      </div>

      {/* Data flow visual — shown from the very start so judges see the
          "problem" before the fix, then watch it flip live when the
          more-specific announcement step (the real winning mechanism)
          completes. */}
      <SimulatedDataFlow incident={incident} restored={restored} halves={halves} />

      {phase === 'idle' && (
        <button onClick={requestAuthorization} style={{
          width: '100%', padding: '10px 0',
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: 1,
          background: 'rgba(191,90,242,0.14)', border: '1px solid rgba(191,90,242,0.5)',
          color: 'var(--accent-purple)', cursor: 'pointer', borderRadius: 3,
        }}>
          🔐 REQUEST NETWORK ENGINEER AUTHORIZATION
        </button>
      )}

      {phase === 'pending' && (
        <div style={{
          padding: '12px 14px', textAlign: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ffd60a',
          background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.3)', borderRadius: 4,
        }}>
          ⏳ Awaiting engineer review…
        </div>
      )}

      {(phase === 'executing' || phase === 'complete') && (
        <div>
          <div style={{
            padding: '8px 12px', marginBottom: 8,
            background: 'rgba(48,209,88,0.06)', border: '1px solid rgba(48,209,88,0.3)', borderRadius: 4,
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-green)', fontWeight: 700,
          }}>
            ✓ AUTHORIZED (SIMULATED) — deploying countermeasures…
          </div>

          {STEPS.map((step, i) => {
            const done = stepIndex >= i
            return (
              <div key={step.key} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                background: done ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${done ? 'rgba(0,255,136,0.2)' : 'var(--border-subtle)'}`,
                borderRadius: 3, marginBottom: 5, transition: 'all 0.2s',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  border: `1px solid ${done ? 'var(--accent-green)' : 'var(--border-mid)'}`,
                  background: done ? 'rgba(0,255,136,0.15)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done ? <span style={{ color: 'var(--accent-green)', fontSize: 9 }}>✓</span> : null}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: done ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                  {done ? step.doneLabel : step.label}
                  {!done && stepIndex === i - 1 ? '…' : ''}
                </span>
              </div>
            )
          })}

          {phase === 'complete' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
                BGP prefers the longer, more-specific match — this is why announcing the halves wins the traffic back,
                the same technique Apple used against the 2022 Rostelecom hijack.
              </div>
              <button onClick={reset} style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, padding: '5px 10px',
                background: 'none', border: '1px solid var(--border-mid)', color: 'var(--text-muted)',
                cursor: 'pointer', borderRadius: 2,
              }}>RESET</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
