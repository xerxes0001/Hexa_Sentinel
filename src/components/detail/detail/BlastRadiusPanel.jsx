/**
 * Blast Radius Simulator panel — visualizes simulateWithROV() output for a
 * single incident. See src/engine/blastRadiusEngine.js for the algorithm
 * and src/data/asTopology.js for the dataset honesty note.
 */
import { useState } from 'react'
import { simulateWithROV, isModeledInTopology } from '../../engine/blastRadiusEngine.js'
import BlastRadiusTree from './BlastRadiusTree.jsx'

function ImpactBar({ pct, color, label }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, color }}>{pct}%</span>
      </div>
      <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.5s ease-out' }} />
      </div>
    </div>
  )
}

export default function BlastRadiusPanel({ incident }) {
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [treeView, setTreeView] = useState('baseline') // 'baseline' | 'rov'

  const attackerModeled = isModeledInTopology(incident.attacker?.asn)

  function runSimulation() {
    setRunning(true)
    // Deliberate small delay so the "computing" state is perceptible —
    // the traversal itself runs in well under a millisecond on this graph size.
    setTimeout(() => {
      const r = simulateWithROV(incident.attacker?.asn, incident.victim?.asn)
      setResult(r)
      setRunning(false)
    }, 400)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        padding: '9px 12px', background: 'rgba(191,90,242,0.06)', border: '1px solid rgba(191,90,242,0.3)',
        borderRadius: 4, marginBottom: 10,
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Predicts propagation using real AS-relationship routing policy (Gao-Rexford export rules, the standard
          model for this analysis) over a representative topology: 9 real Tier-1 backbones, the real NIXI exchange,
          and 42 monitored Indian ASNs — not the full internet's ~75,000 active ASNs. The full CAIDA dataset isn't
          fetchable in this deployment; the algorithm below is the real, citable part regardless of graph size.
        </div>
      </div>

      {!attackerModeled && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--text-muted)',
          padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: 4, lineHeight: 1.6, marginBottom: 10,
        }}>
          Attacker ASN {incident.attacker?.asn ?? '(unknown)'} isn't one of the ~50 networks modeled above —
          expected for a real hijack, since the real internet has far more active ASNs than any hand-curated
          demo topology can include. Works reliably for the Tier-1s and demo attacker origins in the Breach Simulator.
        </div>
      )}

      {!result && attackerModeled && (
        <button onClick={runSimulation} disabled={running} style={{
          width: '100%', padding: '9px 0',
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: 1,
          background: running ? 'rgba(191,90,242,0.08)' : 'rgba(191,90,242,0.14)',
          border: '1px solid rgba(191,90,242,0.5)', color: 'var(--accent-purple)',
          cursor: running ? 'wait' : 'pointer', borderRadius: 3,
        }}>
          {running ? '⏳ COMPUTING PROPAGATION…' : '◈ SIMULATE BLAST RADIUS'}
        </button>
      )}

      {result && (
        <div>
          <ImpactBar pct={result.baseline.interceptionPct} color="#ff2d55" label="BASELINE — hijack propagates unmitigated" />
          <ImpactBar pct={result.withROV.interceptionPct} color="#30d158" label="WITH RPKI ROV ENFORCED AT TIER-1" />

          <div style={{
            padding: '10px 12px', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.25)',
            borderRadius: 4, marginTop: 4, marginBottom: 12,
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, color: 'var(--accent-green)' }}>
              −{result.withROV.reduction} points
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--text-secondary)', marginLeft: 8 }}>
              reduction in propagation if RPKI ROV were enforced at the first Tier-1 hop
            </span>
          </div>

          {/* Tree diagram — visual propagation map */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={() => setTreeView('baseline')} style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, padding: '5px 12px', borderRadius: 2, cursor: 'pointer',
                background: treeView === 'baseline' ? 'rgba(255,45,85,0.15)' : 'none',
                border: `1px solid ${treeView === 'baseline' ? '#ff2d55' : 'var(--border-mid)'}`,
                color: treeView === 'baseline' ? '#ff2d55' : 'var(--text-muted)',
              }}>BASELINE TREE</button>
              <button onClick={() => setTreeView('rov')} style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, padding: '5px 12px', borderRadius: 2, cursor: 'pointer',
                background: treeView === 'rov' ? 'rgba(48,209,88,0.15)' : 'none',
                border: `1px solid ${treeView === 'rov' ? '#30d158' : 'var(--border-mid)'}`,
                color: treeView === 'rov' ? '#30d158' : 'var(--text-muted)',
              }}>WITH ROV TREE</button>
            </div>
            <div style={{ background: 'rgba(6,10,16,0.5)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '12px 8px' }}>
              <BlastRadiusTree tree={treeView === 'baseline' ? result.baseline.tree : result.withROV.tree} width={560} />
            </div>
          </div>

          {result.baseline.affectedIndianASNs.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: '#ff2d55', letterSpacing: 1, marginBottom: 6 }}>
                ⚠ OTHER MONITORED INDIAN ASNs TOPOLOGICALLY EXPOSED
              </div>
              {result.baseline.affectedIndianASNs.map(a => (
                <div key={a.asn} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-primary)',
                  padding: '5px 10px', background: 'rgba(255,45,85,0.04)', border: '1px solid rgba(255,45,85,0.15)',
                  borderRadius: 3, marginBottom: 4,
                }}>
                  {a.name} <span style={{ color: 'var(--text-muted)' }}>({a.asn}, {a.sector})</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--text-secondary)' }}>
            Countries with topologically affected networks: <span style={{ color: 'var(--text-primary)' }}>{result.baseline.countries.join(', ')}</span>
          </div>

          <button onClick={() => { setResult(null); setTreeView('baseline') }} style={{
            marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 8, padding: '5px 10px',
            background: 'none', border: '1px solid var(--border-mid)', color: 'var(--text-muted)',
            cursor: 'pointer', borderRadius: 2,
          }}>RESET</button>
        </div>
      )}
    </div>
  )
}
