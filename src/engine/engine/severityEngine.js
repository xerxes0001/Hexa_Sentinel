const SEVERITY_MATRIX = {
  ORIGIN_HIJACK:     { Financial: 'CRITICAL', Defense: 'CRITICAL', Government: 'HIGH',   Telecom: 'HIGH',   ISP: 'HIGH',   IXP: 'HIGH'   },
  SUBPREFIX_HIJACK:  { Financial: 'HIGH',     Defense: 'HIGH',     Government: 'HIGH',   Telecom: 'MEDIUM', ISP: 'MEDIUM', IXP: 'MEDIUM' },
  ROUTE_LEAK:        { Financial: 'HIGH',     Defense: 'HIGH',     Government: 'MEDIUM', Telecom: 'LOW',    ISP: 'LOW',    IXP: 'LOW'    },
  PATH_MANIPULATION: { Financial: 'MEDIUM',   Defense: 'MEDIUM',   Government: 'MEDIUM', Telecom: 'LOW',    ISP: 'LOW',    IXP: 'LOW'    },
}

export function getSeverity(attackType, sector) {
  return SEVERITY_MATRIX[attackType]?.[sector] ?? 'LOW'
}
