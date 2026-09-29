/**
 * Blast Radius Tree — SVG hierarchical diagram of propagation.
 * Renders the tree/edges data from blastRadiusEngine.js: hijacker at the
 * top, each ring below is one BGP hop further from the origin. Nodes are
 * laid out by hop level (rows) and evenly spaced within each row — a
 * simple, deterministic layout (no physics/force-simulation needed since
 * the graph is small and hierarchical by construction by hop level).
 */
import { useState } from 'react'

const ROLE_COLOR = {
  hijacker: '#ff2d55',
  victim:   '#ffd60a',
  affected: '#bf5af2',
  blocked:  '#3a4452',
}
const KIND_ICON = { tier1: '◆', foreign: '●', indian: '▲', ixp: '■', unknown: '○' }

const ROW_HEIGHT = 76
const NODE_R     = 16
const PADDING    = 40

export default function BlastRadiusTree({ tree, width = 640 }) {
  const [hovered, setHovered] = useState(null)
  if (!tree || tree.nodes.length === 0) return null

  const maxHop = Math.max(...tree.nodes.map(n => n.hop))
  const rows = []
  for (let h = 0; h <= maxHop; h++) rows.push(tree.nodes.filter(n => n.hop === h))

  const height = PADDING * 2 + maxHop * ROW_HEIGHT + NODE_R * 2

  // Compute (x, y) for every node — evenly spaced within its row
  const pos = new Map()
  rows.forEach((row, h) => {
    const y = PADDING + h * ROW_HEIGHT + NODE_R
    const usableWidth = width - PADDING * 2
    row.forEach((node, i) => {
      const x = row.length === 1
        ? width / 2
        : PADDING + (usableWidth * (i + 0.5)) / row.length
      pos.set(node.asn, { x, y })
    })
  })

  const nodeByAsn = new Map(tree.nodes.map(n => [n.asn, n]))

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block', margin: '0 auto' }}>
        {/* Edges first, so nodes render on top */}
        {tree.edges.map((edge, i) => {
          const from = pos.get(edge.from)
          const to   = pos.get(edge.to)
          if (!from || !to) return null
          const targetNode = nodeByAsn.get(edge.to)
          const blocked = targetNode?.role === 'blocked'
          return (
            <line
              key={i}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={blocked ? '#3a4452' : 'rgba(255,45,85,0.35)'}
              strokeWidth={1.5}
              strokeDasharray={blocked ? '4,3' : 'none'}
            />
          )
        })}

        {/* Nodes */}
        {tree.nodes.map(node => {
          const p = pos.get(node.asn)
          if (!p) return null
          const color = ROLE_COLOR[node.role] ?? '#8b96a4'
          const isHovered = hovered === node.asn
          return (
            <g
              key={node.asn}
              transform={`translate(${p.x},${p.y})`}
              onMouseEnter={() => setHovered(node.asn)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                r={isHovered ? NODE_R + 3 : NODE_R}
                fill={node.role === 'blocked' ? 'rgba(58,68,82,0.5)' : `${color}22`}
                stroke={color}
                strokeWidth={node.role === 'hijacker' ? 2.5 : 1.5}
                style={{ transition: 'r 0.15s' }}
              />
              <text
                textAnchor="middle" dominantBaseline="central"
                fontSize={11} fill={node.role === 'blocked' ? '#5c6773' : color}
                fontFamily="var(--font-mono)"
              >
                {node.role === 'blocked' ? '✕' : KIND_ICON[node.kind] ?? '○'}
              </text>
              {/* Label below node */}
              <text
                x={0} y={NODE_R + 12}
                textAnchor="middle"
                fontSize={8} fontFamily="var(--font-mono)"
                fill={node.role === 'blocked' ? '#5c6773' : 'var(--text-secondary)'}
              >
                {node.name.length > 14 ? node.name.slice(0, 13) + '…' : node.name}
              </text>
            </g>
          )
        })}
      </svg>

      {hovered && (
        <div style={{
          position: 'absolute', top: 4, right: 4, padding: '8px 10px',
          background: 'rgba(6,10,16,0.95)', border: '1px solid var(--border-mid)', borderRadius: 4,
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-primary)', maxWidth: 200,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{nodeByAsn.get(hovered)?.name}</div>
          <div style={{ color: 'var(--text-muted)' }}>{hovered} · hop {nodeByAsn.get(hovered)?.hop}</div>
          <div style={{ color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>
            {nodeByAsn.get(hovered)?.role === 'blocked' ? 'Blocked by RPKI ROV' : nodeByAsn.get(hovered)?.role}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 7.5, color: 'var(--text-muted)' }}>
        <span><span style={{ color: ROLE_COLOR.hijacker }}>●</span> Hijacker</span>
        <span><span style={{ color: ROLE_COLOR.victim }}>●</span> Victim</span>
        <span><span style={{ color: ROLE_COLOR.affected }}>●</span> Affected</span>
        <span><span style={{ color: '#5c6773' }}>✕</span> Blocked by ROV</span>
        <span>◆ Tier-1 &nbsp; ▲ Indian ASN &nbsp; ■ IXP &nbsp; ● Foreign carrier</span>
      </div>
    </div>
  )
}
