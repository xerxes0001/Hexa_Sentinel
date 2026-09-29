/**
 * NetworkGraph — D3 Force-Directed Packet Flow Visualization
 * ─────────────────────────────────────────────────────────────
 * Shows live packet flows as an interactive node-link graph.
 * Nodes = IP endpoints. Edges = active connections.
 * Red nodes = flagged THREAT. Amber = SUSPICIOUS. Green = NORMAL.
 *
 * Data sources:
 *  1. Real-time events from the HexaSentinel WebSocket (on-device NPU)
 *  2. RIPE BGP incident IPs from the Zustand store
 *
 * D3 is loaded via CDN (no npm install required).
 */

import { useEffect, useRef, useState } from 'react'
import { useSHYENStore } from '../../store/useSHYENStore.js'

const BASE = import.meta.env.VITE_HEXASENTINEL_API_URL ?? 'http://127.0.0.1:8000'

const NODE_COLOR = {
  THREAT:     '#F43F5E',
  SUSPICIOUS: '#F59E0B',
  NORMAL:     '#10B981',
  BGP:        '#8B5CF6',
  LOCAL:      '#0CD4F5',
}

const MAX_NODES = 60
const MAX_EDGES = 80

// ── Build synthetic graph nodes from a HexaSentinel threat event ─────────────
function eventToNodes(event) {
  const feats   = event.features ?? {}
  const srcIP   = '192.168.1.' + (Math.floor(Math.random() * 20) + 2)
  const numDst  = Math.min(feats.unique_dsts ?? 2, 8)
  const nodes   = [{ id: srcIP, group: event.label, label: srcIP, type: 'source' }]
  const edges   = []
  for (let i = 0; i < numDst; i++) {
    const dstIP = `10.0.${Math.floor(Math.random()*4)}.${Math.floor(Math.random()*254)+1}`
    nodes.push({ id: dstIP, group: 'NORMAL', label: dstIP, type: 'dest' })
    edges.push({ source: srcIP, target: dstIP, weight: feats.pkt_rate ?? 10 })
  }
  return { nodes, edges }
}

// ── Build nodes from BGP incidents ──────────────────────────────────────────
function bgpToNodes(incidents) {
  const nodes = []
  const edges = []
  incidents.slice(0, 5).forEach((inc, i) => {
    const attASN = `AS${inc.attacker?.asn ?? i}`
    const vicASN = `AS${inc.victim?.asn  ?? (i + 100)}`
    nodes.push({ id: attASN, group: 'THREAT',   label: inc.attacker?.name?.slice(0,12) ?? attASN, type: 'bgp' })
    nodes.push({ id: vicASN, group: 'SUSPICIOUS',label: inc.victim?.name?.slice(0,12)  ?? vicASN, type: 'bgp' })
    edges.push({ source: attASN, target: vicASN, weight: 30 })
  })
  return { nodes, edges }
}

export default function NetworkGraph({ height = 400 }) {
  const svgRef    = useRef(null)
  const simRef    = useRef(null)
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [d3Ready,   setD3Ready]   = useState(false)
  const graphRef  = useRef({ nodes: [], edges: [] })
  const incidents = useSHYENStore(s => s.incidents ?? [])

  // ── Load D3 from CDN ──────────────────────────────────────────────────────
  useEffect(() => {
    if (window.d3) { setD3Ready(true); return }
    const script = document.createElement('script')
    script.src   = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'
    script.onload = () => setD3Ready(true)
    script.onerror= () => console.error('[NetworkGraph] D3 CDN load failed')
    document.head.appendChild(script)
    return () => document.head.removeChild(script)
  }, [])

  // ── Seed initial nodes from BGP incidents ─────────────────────────────────
  useEffect(() => {
    if (!d3Ready || !incidents.length) return
    const { nodes, edges } = bgpToNodes(incidents)
    mergeGraph(nodes, edges)
  }, [d3Ready, incidents.length])

  // ── Subscribe to HexaSentinel WebSocket for live packet events ─────────────
  useEffect(() => {
    const handler = (e) => {
      try {
        const event = JSON.parse(e.detail ?? '{}')
        if (event.label && event.label !== 'NORMAL') {
          const { nodes, edges } = eventToNodes(event)
          mergeGraph(nodes, edges)
        }
      } catch {}
    }
    window.addEventListener('hexasentinel:threat', handler)
    return () => window.removeEventListener('hexasentinel:threat', handler)
  }, [d3Ready])

  // ── Merge new nodes/edges into the graph (capped) ─────────────────────────
  function mergeGraph(newNodes, newEdges) {
    const g = graphRef.current
    newNodes.forEach(n => {
      if (!g.nodes.find(x => x.id === n.id)) {
        g.nodes.push({ ...n, x: Math.random() * 600, y: Math.random() * height })
      } else {
        // Update group if escalated
        const existing = g.nodes.find(x => x.id === n.id)
        if (n.group === 'THREAT') existing.group = 'THREAT'
      }
    })
    newEdges.forEach(e => {
      if (!g.edges.find(x => x.source === e.source && x.target === e.target)) {
        g.edges.push(e)
      }
    })
    // Cap sizes
    if (g.nodes.length > MAX_NODES) g.nodes.splice(0, g.nodes.length - MAX_NODES)
    if (g.edges.length > MAX_EDGES) g.edges.splice(0, g.edges.length - MAX_EDGES)
    setNodeCount(g.nodes.length)
    setEdgeCount(g.edges.length)
    renderGraph()
  }

  // ── D3 rendering ──────────────────────────────────────────────────────────
  function renderGraph() {
    if (!d3Ready || !svgRef.current || !window.d3) return
    const d3  = window.d3
    const svg = d3.select(svgRef.current)
    const g   = graphRef.current
    const W   = svgRef.current.clientWidth || 700

    svg.selectAll('*').remove()

    // Tooltip
    const tooltip = d3.select('body').selectAll('.ng-tooltip').data([1])
      .join('div').attr('class', 'ng-tooltip')
      .style('position','fixed').style('pointer-events','none')
      .style('display','none')
      .style('background','rgba(6,10,18,0.97)')
      .style('border','1px solid rgba(255,255,255,0.1)')
      .style('border-radius','6px').style('padding','8px 12px')
      .style('font-family','monospace').style('font-size','11px')
      .style('color','#EAF2FF').style('z-index','9999')
      .style('max-width','200px')

    // Defs: arrowhead
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id','ng-arrow').attr('markerWidth',8).attr('markerHeight',8)
      .attr('refX',14).attr('refY',3).attr('orient','auto')
      .append('path').attr('d','M0,0 L0,6 L7,3 z')
      .attr('fill','rgba(255,255,255,0.15)')

    defs.selectAll('.ngGlow').data(['THREAT','SUSPICIOUS','BGP']).join('filter')
      .attr('id', d => `ngGlow-${d}`).attr('class','ngGlow')
      .append('feGaussianBlur').attr('stdDeviation',3).attr('result','blur')
      .select(function(){ return this.parentNode })
      .append('feMerge').selectAll('feMergeNode').data([0,1]).join('feMergeNode')
      .attr('in', (_,i) => i === 0 ? 'blur' : 'SourceGraphic')

    const container = svg.append('g')

    // Zoom
    svg.call(d3.zoom().scaleExtent([0.3,3]).on('zoom', e => container.attr('transform', e.transform)))

    // Edges
    const link = container.append('g').selectAll('line')
      .data(g.edges).join('line')
      .attr('stroke','rgba(255,255,255,0.07)')
      .attr('stroke-width', d => Math.max(0.5, Math.log(d.weight + 1) * 0.3))
      .attr('marker-end','url(#ng-arrow)')

    // Node groups
    const node = container.append('g').selectAll('g')
      .data(g.nodes).join('g')
      .attr('cursor','pointer')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on('mouseover', (event, d) => {
        tooltip.style('display','block')
          .html(`<strong>${d.id}</strong><br/><span style="color:${NODE_COLOR[d.group] ?? '#8BA8C8'}">${d.group}</span><br/>${d.label}`)
      })
      .on('mousemove', (event) => {
        tooltip.style('left', (event.clientX + 14) + 'px').style('top', (event.clientY - 28) + 'px')
      })
      .on('mouseleave', () => tooltip.style('display','none'))

    // Node circle
    node.append('circle')
      .attr('r', d => d.type === 'source' ? 9 : 6)
      .attr('fill', d => `${NODE_COLOR[d.group] ?? '#4F6A88'}22`)
      .attr('stroke', d => NODE_COLOR[d.group] ?? '#4F6A88')
      .attr('stroke-width', d => d.group === 'THREAT' ? 2 : 1.2)
      .attr('filter', d => ['THREAT','SUSPICIOUS','BGP'].includes(d.group) ? `url(#ngGlow-${d.group === 'SUSPICIOUS' ? 'THREAT' : d.group})` : null)

    // Pulse ring for THREAT nodes
    node.filter(d => d.group === 'THREAT')
      .append('circle')
      .attr('r', 12).attr('fill','none')
      .attr('stroke','#F43F5E').attr('stroke-width',1).attr('opacity',0.4)
      .append('animate')
        .attr('attributeName','r').attr('from',9).attr('to',18)
        .attr('dur','1.8s').attr('repeatCount','indefinite')

    // Node label
    node.append('text')
      .text(d => d.label.length > 14 ? d.label.slice(0,12) + '…' : d.label)
      .attr('dy', d => d.type === 'source' ? -13 : -10)
      .attr('text-anchor','middle')
      .attr('font-family','monospace').attr('font-size', d => d.type === 'source' ? 8 : 7)
      .attr('fill', d => NODE_COLOR[d.group] ?? '#8BA8C8')
      .attr('opacity', 0.8)

    // Force simulation
    simRef.current?.stop()
    const sim = d3.forceSimulation(g.nodes)
      .force('link',    d3.forceLink(g.edges).id(d => d.id).distance(90).strength(0.4))
      .force('charge',  d3.forceManyBody().strength(-200))
      .force('center',  d3.forceCenter(W / 2, height / 2))
      .force('collision', d3.forceCollide(18))
      .on('tick', () => {
        link
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        node.attr('transform', d => `translate(${d.x},${d.y})`)
      })
    simRef.current = sim
  }

  // ── Re-render on resize ────────────────────────────────────────────────────
  useEffect(() => {
    if (!d3Ready) return
    const ro = new ResizeObserver(() => renderGraph())
    if (svgRef.current) ro.observe(svgRef.current)
    return () => ro.disconnect()
  }, [d3Ready])

  // ── Initial render ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (d3Ready) renderGraph()
  }, [d3Ready])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg,#070E1C)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:'#0CD4F5' }}>
            PACKET FLOW GRAPH
          </span>
          <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:8, color:'rgba(255,255,255,0.2)' }}>
            D3 FORCE-DIRECTED
          </span>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          {[['NODES', nodeCount, '#0CD4F5'], ['EDGES', edgeCount, '#8BA8C8']].map(([l,v,c]) => (
            <span key={l} style={{ fontFamily:'var(--font-mono,monospace)', fontSize:8, color:c }}>
              {l}: {v}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:14, padding:'5px 14px', borderBottom:'1px solid rgba(255,255,255,0.04)', flexShrink:0, flexWrap:'wrap' }}>
        {[['THREAT','#F43F5E'],['SUSPICIOUS','#F59E0B'],['NORMAL','#10B981'],['BGP INCIDENT','#8B5CF6'],['LOCAL','#0CD4F5']].map(([l,c]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:c, boxShadow:`0 0 4px ${c}` }}/>
            <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:7, color:'rgba(255,255,255,0.35)', letterSpacing:'0.05em' }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Graph */}
      {!d3Ready ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'rgba(255,255,255,0.2)' }}>
          Loading D3…
        </div>
      ) : nodeCount === 0 ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
          <svg width="36" height="40" viewBox="0 0 36 40" fill="none">
            <path d="M18 2L34 10V22C34 30 27 36 18 39C9 36 2 30 2 22V10Z" fill="rgba(12,212,245,0.05)" stroke="#0CD4F5" strokeWidth="1.5" opacity="0.5"/>
          </svg>
          <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'rgba(255,255,255,0.2)', textAlign:'center', lineHeight:1.8 }}>
            Waiting for traffic events…<br/>
            Nodes appear when the ONNX classifier fires<br/>or BGP incidents are detected.
          </span>
        </div>
      ) : (
        <svg ref={svgRef} style={{ flex:1, width:'100%', display:'block' }} />
      )}
    </div>
  )
}
