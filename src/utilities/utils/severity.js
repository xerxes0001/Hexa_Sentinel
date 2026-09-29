/**
 * Shared severity constants.
 *
 * The same CRITICAL/HIGH/MEDIUM/LOW color values and ordering were
 * copy-pasted independently across BreachSimulator.jsx, AttackHistoryPanel.jsx,
 * AttackDropdown.jsx, Globe3D.jsx, ThreatMap.jsx, CountryHistoryPage.jsx, and
 * App.jsx. Consolidated here so there's one source of truth — change a
 * color once and every view updates together instead of drifting.
 */

// Worst-to-best severity ranking, used for sorting and "worst severity wins" comparisons.
export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

// CSS hex strings — for inline styles / SVG fill / DOM.
export const SEVERITY_COLORS = {
  CRITICAL: '#ff2d55',
  HIGH:     '#ff6b00',
  MEDIUM:   '#ffd60a',
  LOW:      '#30d158',
}

// Same palette as numeric hex — for three.js materials (Globe3D), which
// need 0xRRGGBB rather than a CSS string.
export const SEVERITY_COLORS_HEX = {
  CRITICAL: 0xff2d55,
  HIGH:     0xff6b00,
  MEDIUM:   0xffd60a,
  LOW:      0x30d158,
}
