/**
 * Globe3D — rotating 3D globe with three.js
 * Bug fixes:
 * 1. Dropdown pointer-events blocked by canvas overlay — fixed with z-index + stopPropagation
 * 2. Earth texture too dark — increased opacity, added ambient light boost
 * 3. Globe sometimes freezes on resize — added ResizeObserver cleanup
 * 4. Labels not clearing on re-render — fixed label container flush
 * 5. Click not registering on some machines — mousedown/mouseup delta check tightened
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useSHYENStore } from '../../store/useSHYENStore.js'
import AttackDropdown from './AttackDropdown.jsx'
import earthMapUrl from '../../assets/earth-map.png'
import { INDIA_BOUNDARY, INDIA_ISLAND_TERRITORIES } from '../../data/indiaBoundary.js'
import { SEVERITY_COLORS_HEX as SEV_COLOR_HEX, SEVERITY_COLORS as SEV_COLOR_CSS, SEVERITY_ORDER } from '../../utils/severity.js'

const R = 1.6

function lonLatToVec3(lon, lat, r = R + 0.01) {
  const phi   = (90 - lat) * Math.PI / 180
  const theta = (lon + 180) * Math.PI / 180
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

const earthTextureLoader = new THREE.TextureLoader()
function loadEarthTexture() {
  const tex = earthTextureLoader.load(earthMapUrl)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function arcPoints(from, to, segments = 60, lift = 0.35) {
  const pts = []
  const axis   = new THREE.Vector3().crossVectors(from, to).normalize()
  const angle  = from.angleTo(to)
  const mid    = from.clone().applyAxisAngle(axis, angle / 2).normalize().multiplyScalar(R + lift)
  const curve  = new THREE.QuadraticBezierCurve3(
    from.clone().normalize().multiplyScalar(R),
    mid,
    to.clone().normalize().multiplyScalar(R),
  )
  for (let i = 0; i <= segments; i++) pts.push(curve.getPoint(i / segments))
  return pts
}

export default function Globe3D({ onViewHistory, onCountryClick }) {
  const incidents     = useSHYENStore(s => s.incidents)
  const incidentsRef  = useRef(incidents)
  incidentsRef.current = incidents

  const onCountryClickRef = useRef(onCountryClick)
  onCountryClickRef.current = onCountryClick

  const mountRef          = useRef(null)
  const labelContainerRef = useRef(null)
  const globeRef          = useRef(null)
  const dynamicRef        = useRef(null)
  const markersRef        = useRef([])
  const rendererRef       = useRef(null)
  const cameraRef         = useRef(null)
  const rafRef            = useRef(null)

  const [dropdown, setDropdown] = useState(null)

  // ---- scene setup (runs once) ----
  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const W = el.clientWidth  || 800
    const H = el.clientHeight || 400

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    el.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
    camera.position.set(0, 0, 4.5)
    cameraRef.current = camera

    // Lighting — boosted ambient so texture is visible
    scene.add(new THREE.AmbientLight(0xffffff, 1.8))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 3, 5)
    scene.add(dir)

    const globeGroup = new THREE.Group()
    scene.add(globeGroup)
    globeRef.current = globeGroup

    // Earth sphere
    const sphereGeo = new THREE.SphereGeometry(R, 64, 64)
    const sphereMat = new THREE.MeshPhongMaterial({
      map: loadEarthTexture(),
      transparent: false,
      shininess: 10,
    })
    globeGroup.add(new THREE.Mesh(sphereGeo, sphereMat))

    // Subtle atmosphere glow
    const atmGeo = new THREE.SphereGeometry(R + 0.04, 32, 32)
    const atmMat = new THREE.MeshBasicMaterial({ color: 0x003322, transparent: true, opacity: 0.15, side: THREE.BackSide })
    globeGroup.add(new THREE.Mesh(atmGeo, atmMat))

    // Grid lines
    const gridMat = new THREE.LineBasicMaterial({ color: 0x123042, transparent: true, opacity: 0.4 })
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = []
      for (let lon = 0; lon <= 360; lon += 4) pts.push(lonLatToVec3(lon, lat, R + 0.002))
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat))
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const pts = []
      for (let lat = -90; lat <= 90; lat += 4) pts.push(lonLatToVec3(lon, lat, R + 0.002))
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat))
    }

    // India marker — always shown
    const indiaPos  = lonLatToVec3(78, 20)
    const indiaMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff88 }),
    )
    indiaMesh.position.copy(indiaPos)
    globeGroup.add(indiaMesh)

    // India — corrected boundary outline. The base earth-map.png texture
    // follows the LAC in the north, cutting off Gilgit-Baltistan and Aksai
    // Chin. Drawn as a precise line (not a filled mesh, to avoid sphere-
    // triangulation artifacts on this large a concave polygon) tracing the
    // Survey-of-India official boundary — see src/data/indiaBoundary.js.
    const indiaBoundaryPts = INDIA_BOUNDARY.map(([lon, lat]) => lonLatToVec3(lon, lat, R + 0.006))
    const indiaBoundaryLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(indiaBoundaryPts),
      new THREE.LineBasicMaterial({ color: 0x5ba86b, transparent: true, opacity: 0.85 }),
    )
    globeGroup.add(indiaBoundaryLine)

    // India's island territories — not visible in the base texture at this
    // resolution (confirmed via pixel sampling), marked explicitly here
    // with the same small-sphere style as the mainland India marker.
    for (const { lon, lat } of INDIA_ISLAND_TERRITORIES) {
      const pos = lonLatToVec3(lon, lat)
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x5ba86b }),
      )
      mesh.position.copy(pos)
      globeGroup.add(mesh)
    }

    // Dynamic group for attacker markers + arcs
    const dynamicGroup = new THREE.Group()
    globeGroup.add(dynamicGroup)
    dynamicRef.current = dynamicGroup

    // Label helper
    function addLabel(worldPos, text, color, cssClass = '') {
      const lc = labelContainerRef.current
      if (!lc) return
      const el2 = document.createElement('div')
      el2.textContent = text
      el2.style.cssText = `position:absolute;font-family:'JetBrains Mono',monospace;font-size:9px;color:${color};pointer-events:none;white-space:nowrap;text-shadow:0 0 6px ${color};opacity:0.9;`
      lc.appendChild(el2)
      return { el: el2, worldPos }
    }

    // India label
    const indiaLabel = addLabel(indiaPos, 'INDIA', '#00ff88')
    const labels = indiaLabel ? [indiaLabel] : []

    // Auto-rotate
    let autoRotate    = true
    let rotateVel     = 0.001
    let isDragging    = false
    let prevMouse     = { x: 0, y: 0 }
    let downPos       = { x: 0, y: 0 }
    let dragVel       = 0
    let lastDragTime  = 0

    function onDown(e) {
      const p = e.touches ? e.touches[0] : e
      isDragging = true
      autoRotate = false
      prevMouse  = { x: p.clientX, y: p.clientY }
      downPos    = { x: p.clientX, y: p.clientY }
      dragVel    = 0
    }

    function onMove(e) {
      if (!isDragging) return
      const p  = e.touches ? e.touches[0] : e
      const dx = p.clientX - prevMouse.x
      globeGroup.rotation.y += dx * 0.006
      dragVel   = dx
      lastDragTime = Date.now()
      prevMouse = { x: p.clientX, y: p.clientY }
    }

    function onUp(e) {
      if (!isDragging) return
      isDragging = false
      const p    = e.changedTouches ? e.changedTouches[0] : e
      const moved = Math.abs(p.clientX - downPos.x) + Math.abs(p.clientY - downPos.y)
      if (moved < 5) handleClick(p.clientX, p.clientY)
      // Resume auto-rotate after pause
      setTimeout(() => { autoRotate = true }, 2500)
    }

    // Raycaster for click detection
    const raycaster = new THREE.Raycaster()
    raycaster.params.Points = { threshold: 0.1 }
    const mouse = new THREE.Vector2()

    function handleClick(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x =  ((clientX - rect.left) / rect.width)  * 2 - 1
      mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const targets = markersRef.current.map(m => m.mesh)
      if (targets.length === 0) { setDropdown(null); return }
      const hits = raycaster.intersectObjects(targets, false)
      if (hits.length === 0) { setDropdown(null); return }
      const hit = markersRef.current.find(m => m.mesh === hits[0].object)
      if (!hit) { setDropdown(null); return }

      const incs = incidentsRef.current
        .filter(i => i.attacker?.country === hit.code)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      onCountryClickRef.current?.(hit.code)
      setDropdown({
        code: hit.code, name: hit.name,
        x: clientX - rect.left,
        y: clientY - rect.top,
        attacks: incs,
      })
    }

    const dom = renderer.domElement
    dom.addEventListener('mousedown',  onDown)
    dom.addEventListener('mousemove',  onMove)
    window.addEventListener('mouseup', onUp)
    dom.addEventListener('touchstart', onDown, { passive: true })
    dom.addEventListener('touchmove',  onMove, { passive: true })
    window.addEventListener('touchend', onUp)

    // Resize handling
    const ro = new ResizeObserver(() => {
      if (!el) return
      const W2 = el.clientWidth  || 800
      const H2 = el.clientHeight || 400
      camera.aspect = W2 / H2
      camera.updateProjectionMatrix()
      renderer.setSize(W2, H2)
    })
    ro.observe(el)

    // Animation loop
    function animate() {
      rafRef.current = requestAnimationFrame(animate)
      if (autoRotate) globeGroup.rotation.y += rotateVel
      else if (!isDragging && Math.abs(dragVel) > 0.05) {
        globeGroup.rotation.y += dragVel * 0.004
        dragVel *= 0.94
      }

      // Update label positions
      for (const { el: lel, worldPos } of labels) {
        const projected = worldPos.clone().project(camera)
        lel.style.left = `${(projected.x * 0.5 + 0.5) * el.clientWidth  + 12}px`
        lel.style.top  = `${(-projected.y * 0.5 + 0.5) * el.clientHeight - 6}px`
        // Hide if on far side
        const dot = worldPos.clone().normalize().dot(new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion))
        lel.style.opacity = dot > -0.1 ? '0.9' : '0'
      }

      // Update dynamic labels
      const dynamicLabels = dynamicGroup.userData.labels ?? []
      for (const { el: del, worldPos } of dynamicLabels) {
        if (!del.parentElement) continue
        const projected = worldPos.clone().project(camera)
        del.style.left = `${(projected.x * 0.5 + 0.5) * el.clientWidth  + 10}px`
        del.style.top  = `${(-projected.y * 0.5 + 0.5) * el.clientHeight - 4}px`
        const dot = worldPos.clone().normalize().dot(new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion))
        del.style.opacity = dot > -0.1 ? '1' : '0'
      }

      // Animate arc travel dots (moved from setInterval — single animation source)
      if (dynamicRef.current) {
        for (const child of dynamicRef.current.children) {
          child.userData.animateFn?.()
        }
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      dom.removeEventListener('mousedown',  onDown)
      dom.removeEventListener('mousemove',  onMove)
      window.removeEventListener('mouseup', onUp)
      dom.removeEventListener('touchstart', onDown)
      dom.removeEventListener('touchmove',  onMove)
      window.removeEventListener('touchend', onUp)
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      if (labelContainerRef.current) labelContainerRef.current.innerHTML = ''
    }
  }, [])

  // ---- rebuild dynamic markers + arcs on incident change ----
  useEffect(() => {
    const dynamicGroup = dynamicRef.current
    const el           = mountRef.current
    const lc           = labelContainerRef.current
    if (!dynamicGroup || !lc) return

    // Clear previous — must also reset userData.labels or animate loop hits removed DOM nodes
    while (dynamicGroup.children.length) dynamicGroup.remove(dynamicGroup.children[0])
    dynamicGroup.userData.labels = []  // BUG FIX: was never reset, caused TypeError on ghost elements
    if (lc) {
      const toRemove = lc.querySelectorAll('.dyn-label')
      toRemove.forEach(n => n.remove())
    }
    markersRef.current = []

    const indiaPos  = lonLatToVec3(78, 20)
    const sevOrder  = SEVERITY_ORDER
    const attackMap = new Map()
    const unresolved = []

    for (const inc of incidents) {
      if (inc.status === 'MITIGATED') continue
      const c = inc.attacker?.country
      if (!c || c === '??') { unresolved.push(inc); continue }
      const ex = attackMap.get(c)
      if (!ex || sevOrder.indexOf(inc.severity) < sevOrder.indexOf(ex.severity)) {
        attackMap.set(c, { inc, code: c })
      }
    }

    function addDynLabel(worldPos, text, color) {
      if (!lc || !el) return
      const div = document.createElement('div')
      div.className = 'dyn-label'
      div.textContent = text
      div.style.cssText = `position:absolute;font-family:'JetBrains Mono',monospace;font-size:8px;color:${color};pointer-events:none;white-space:nowrap;text-shadow:0 0 5px ${color};`
      lc.appendChild(div)
      dynamicGroup.userData.labels = [...(dynamicGroup.userData.labels ?? []), { el: div, worldPos }]
    }

    function addArc(from, to, color, dashed = false) {
      const pts = arcPoints(from, to)
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: dashed ? 0.4 : 0.7 })
      dynamicGroup.add(new THREE.Line(geo, mat))

      // Animated dot along arc
      const dotGeo = new THREE.SphereGeometry(0.018, 8, 8)
      const dotMat = new THREE.MeshBasicMaterial({ color })
      const dot    = new THREE.Mesh(dotGeo, dotMat)
      dynamicGroup.add(dot)

      let t = Math.random()
      const speed = 0.004 + Math.random() * 0.003
      const curve = new THREE.QuadraticBezierCurve3(
        pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1],
      )
      dot.userData.animateFn = () => {
        t = (t + speed) % 1
        dot.position.copy(curve.getPoint(t))
      }
    }

    // Resolved attackers
    for (const [, { inc, code }] of attackMap) {
      const { lon, lat } = WORLD_COUNTRIES_LON_LAT[code] ?? {}
      if (lon == null) continue
      const pos   = lonLatToVec3(lon, lat)
      const color = SEV_COLOR_HEX[inc.severity] ?? 0x888888
      const css   = SEV_COLOR_CSS[inc.severity] ?? '#888'
      const size  = inc.severity === 'CRITICAL' ? 0.042 : inc.severity === 'HIGH' ? 0.036 : 0.028

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(size, 16, 16),
        new THREE.MeshBasicMaterial({ color }),
      )
      marker.position.copy(pos)
      dynamicGroup.add(marker)
      markersRef.current.push({ mesh: marker, code, name: COUNTRY_NAMES[code] ?? code })

      addDynLabel(pos, `${COUNTRY_NAMES[code] ?? code}`, css)
      addArc(pos, indiaPos, color)
    }

    // Unresolved — "?" marker in Atlantic
    if (unresolved.length > 0) {
      const color   = SEV_COLOR_HEX[unresolved[0].severity] ?? 0xffd60a
      const pendPos = lonLatToVec3(-20, 5)
      const pendMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd60a }),
      )
      pendMesh.position.copy(pendPos)
      dynamicGroup.add(pendMesh)
      addDynLabel(pendPos, `RESOLVING (${unresolved.length})`, '#ffd60a')
      addArc(pendPos, indiaPos, 0xffd60a, true)
    }

    dynamicGroup.userData.labels = dynamicGroup.userData.labels ?? []

    // Dot animation is handled by the rAF loop in the scene setup effect
    // (it iterates dynamicGroup.children and calls animateFn each frame)
    // No setInterval needed — was causing double-speed animation + two timers per update
    return () => {}
  }, [incidents])

  return (
    <div style={{ position:'relative', width:'100%', height: 420 }}>
      <div ref={mountRef} style={{ width:'100%', height:'100%' }} />
      {/* Label overlay — pointer-events none so clicks pass to canvas */}
      <div ref={labelContainerRef} style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }} />
      {/* Dropdown — must be ABOVE canvas with pointer-events on */}
      {dropdown && (
        <div style={{ position:'absolute', inset:0, zIndex:40, pointerEvents:'none' }}>
          <div style={{ position:'absolute', left: dropdown.x, top: dropdown.y, pointerEvents:'all' }}>
            <AttackDropdown
              countryCode={dropdown.code}
              countryName={dropdown.name}
              attacks={dropdown.attacks}
              x={0} y={0}
              onClose={() => setDropdown(null)}
              onViewHistory={(code) => { setDropdown(null); onViewHistory?.(code) }}
            />
          </div>
        </div>
      )}
      {/* Legend */}
      <div style={{
        position:'absolute', bottom:8, left:12, display:'flex', gap:10, flexWrap:'wrap',
        fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)',
        background:'rgba(6,10,15,0.7)', padding:'4px 8px', borderRadius:4,
        pointerEvents:'none',
      }}>
        {Object.entries(SEV_COLOR_CSS).map(([sev, c]) => (
          <span key={sev} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:c, display:'inline-block' }} />{sev}
          </span>
        ))}
        <span style={{ marginLeft:6, opacity:0.5 }}>· drag to rotate · click a glowing marker · yellow = resolving origin</span>
      </div>
    </div>
  )
}

// Country lon/lat lookup for marker placement
const WORLD_COUNTRIES_LON_LAT = {
  CN:{lon:104,lat:35}, PK:{lon:68,lat:30}, US:{lon:-95,lat:38}, DE:{lon:10,lat:51},
  IT:{lon:12,lat:42}, AU:{lon:134,lat:-25}, JP:{lon:138,lat:36}, EG:{lon:30,lat:26},
  RU:{lon:37,lat:55}, GB:{lon:-2,lat:54}, NL:{lon:5,lat:52}, FR:{lon:2,lat:46},
  BR:{lon:-51,lat:-10}, SG:{lon:104,lat:1}, KR:{lon:128,lat:36}, CA:{lon:-106,lat:56},
  ZA:{lon:24,lat:-29}, ID:{lon:113,lat:-2}, VN:{lon:108,lat:16}, TH:{lon:101,lat:15},
  UA:{lon:31,lat:49}, PL:{lon:19,lat:52}, ES:{lon:-4,lat:40}, SE:{lon:18,lat:60},
  CH:{lon:8,lat:47}, TR:{lon:35,lat:39}, HK:{lon:114,lat:22}, TW:{lon:121,lat:24},
  MX:{lon:-102,lat:23}, AE:{lon:54,lat:24}, SA:{lon:45,lat:24}, IR:{lon:53,lat:32},
  BD:{lon:90,lat:24}, NG:{lon:8,lat:9}, RO:{lon:25,lat:46}, PT:{lon:-8,lat:39},
  MA:{lon:-7,lat:32}, DZ:{lon:3,lat:28}, LY:{lon:17,lat:25},
}

const COUNTRY_NAMES = {
  CN:'China', PK:'Pakistan', US:'USA', DE:'Germany', IT:'Italy', AU:'Australia',
  JP:'Japan', EG:'Egypt', RU:'Russia', GB:'UK', NL:'Netherlands', FR:'France',
  BR:'Brazil', SG:'Singapore', KR:'S.Korea', CA:'Canada', ZA:'S.Africa',
  ID:'Indonesia', VN:'Vietnam', TH:'Thailand', UA:'Ukraine', PL:'Poland',
  ES:'Spain', SE:'Sweden', CH:'Switzerland', TR:'Turkey', HK:'Hong Kong',
  TW:'Taiwan', MX:'Mexico', AE:'UAE', SA:'Saudi Arabia', IR:'Iran',
  BD:'Bangladesh', NG:'Nigeria', RO:'Romania', PT:'Portugal', MA:'Morocco',
  DZ:'Algeria', LY:'Libya',
}
