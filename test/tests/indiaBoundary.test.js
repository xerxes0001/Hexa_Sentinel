import { describe, it, expect } from 'vitest'
import { INDIA_BOUNDARY, INDIA_ISLAND_TERRITORIES } from '../src/data/indiaBoundary.js'

// Point-in-polygon test (ray casting) for sanity-checking specific
// real-world locations against the boundary.
function pointInPolygon(lon, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

describe('INDIA_BOUNDARY — corrected map data integrity', () => {
  it('is a closed ring (first point equals last point)', () => {
    const first = INDIA_BOUNDARY[0]
    const last  = INDIA_BOUNDARY[INDIA_BOUNDARY.length - 1]
    expect(first[0]).toBe(last[0])
    expect(first[1]).toBe(last[1])
  })

  it('has no null/undefined/NaN coordinates', () => {
    for (const [lon, lat] of INDIA_BOUNDARY) {
      expect(Number.isFinite(lon)).toBe(true)
      expect(Number.isFinite(lat)).toBe(true)
    }
  })

  it('all coordinates fall within plausible bounds for this region', () => {
    for (const [lon, lat] of INDIA_BOUNDARY) {
      expect(lon).toBeGreaterThan(60)
      expect(lon).toBeLessThan(100)
      expect(lat).toBeGreaterThan(5)
      expect(lat).toBeLessThan(40)
    }
  })

  it('extends north enough to include Gilgit-Baltistan (the core fix)', () => {
    const maxLat = Math.max(...INDIA_BOUNDARY.map(p => p[1]))
    // Previous boundary topped out at 35.5°N; corrected version must
    // clearly exceed that to include Gilgit-Baltistan/Wakhan Corridor area.
    expect(maxLat).toBeGreaterThan(36.5)
  })

  it('extends east enough to include the Aksai Chin plateau', () => {
    // Aksai Chin's eastern extent is around 80°E — previous boundary
    // topped out around 79.2°E in the northern region.
    const northernPoints = INDIA_BOUNDARY.filter(p => p[1] > 34)
    const maxLon = Math.max(...northernPoints.map(p => p[0]))
    expect(maxLon).toBeGreaterThanOrEqual(79.5)
  })

  it('still contains well-known undisputed Indian cities (regression guard against breaking the rest of the shape)', () => {
    const cities = [
      ['New Delhi', 77.21, 28.61],
      ['Mumbai', 72.88, 19.08],
      ['Chennai', 80.27, 13.08],
      ['Kolkata', 88.36, 22.57],
      ['Srinagar', 74.80, 34.08],
    ]
    for (const [name, lon, lat] of cities) {
      expect(pointInPolygon(lon, lat, INDIA_BOUNDARY), `${name} should be inside the boundary`).toBe(true)
    }
  })

  it('contains the corrected region — Gilgit and Aksai Chin reference points', () => {
    const points = [
      ['Gilgit', 74.35, 35.92],
      ['Aksai Chin (interior)', 79.5, 35.0],
    ]
    for (const [name, lon, lat] of points) {
      expect(pointInPolygon(lon, lat, INDIA_BOUNDARY), `${name} should be inside the corrected boundary`).toBe(true)
    }
  })

  it('does not balloon absurdly far beyond the Kashmir region (sanity bound on the correction)', () => {
    // Guards against a coordinate typo creating a wildly wrong shape —
    // nothing in the corrected segment should be north of Central Asia.
    const maxLat = Math.max(...INDIA_BOUNDARY.map(p => p[1]))
    expect(maxLat).toBeLessThan(40)
  })
})

describe('INDIA_ISLAND_TERRITORIES — Lakshadweep and Andaman & Nicobar', () => {
  it('includes both real island territories', () => {
    const names = INDIA_ISLAND_TERRITORIES.map(t => t.name)
    expect(names).toContain('Lakshadweep')
    expect(names).toContain('Andaman & Nicobar')
  })

  it('places Lakshadweep in the Arabian Sea, west of the mainland coast', () => {
    const l = INDIA_ISLAND_TERRITORIES.find(t => t.name === 'Lakshadweep')
    expect(l.lon).toBeGreaterThan(70)
    expect(l.lon).toBeLessThan(75)
    expect(l.lat).toBeGreaterThan(8)
    expect(l.lat).toBeLessThan(13)
  })

  it('places Andaman & Nicobar in the Bay of Bengal, well east of the mainland', () => {
    const a = INDIA_ISLAND_TERRITORIES.find(t => t.name === 'Andaman & Nicobar')
    expect(a.lon).toBeGreaterThan(90)
    expect(a.lon).toBeLessThan(95)
  })

  it('no island territory coordinate is accidentally inside the mainland ring (they should be genuinely offshore)', () => {
    function pointInPolygon(lon, lat, ring) {
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        const intersect = ((yi > lat) !== (yj > lat)) &&
          (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
      }
      return inside
    }
    for (const t of INDIA_ISLAND_TERRITORIES) {
      expect(pointInPolygon(t.lon, t.lat, INDIA_BOUNDARY), `${t.name} should be offshore, not inside the mainland ring`).toBe(false)
    }
  })
})
