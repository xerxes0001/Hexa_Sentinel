/**
 * Campaign Detection Engine
 *
 * A higher-order signal than single-incident detection: correlates multiple
 * incidents that share attacker infrastructure within a rolling time
 * window, flagging a coordinated multi-target campaign rather than
 * isolated events.
 *
 * Two correlation tiers, kept explicitly distinct rather than blended into
 * one score, since they carry different confidence:
 *   'same-asn'     — the exact same attacker ASN hit multiple victims.
 *                    Strong signal: this is unambiguously one actor.
 *   'same-country'  — different attacker ASNs, but registered in the same
 *                    country, hitting multiple victims in the window.
 *                    Weaker signal (different ASNs could be unrelated
 *                    coincidence), so it requires a stricter bar: at least
 *                    2 distinct ASNs AND 2 distinct victims, and only
 *                    considers incidents not already claimed by a
 *                    same-ASN campaign, so it never just re-labels the
 *                    same cluster under a fuzzier tier.
 */

// Incidents within this window sharing attacker infrastructure count as
// the same campaign. 2 hours matches the kind of operational window a
// real coordinated attack (recon → multiple targets) would plausibly run in.
const CAMPAIGN_WINDOW_MS = 2 * 3600 * 1000

function clusterByKey(incidents, keyFn) {
  const byKey = new Map()
  for (const inc of incidents) {
    const key = keyFn(inc)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(inc)
  }

  const clusters = []
  for (const [key, group] of byKey) {
    const sorted = [...group].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    let cluster = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      const gap = new Date(sorted[i].timestamp) - new Date(sorted[i - 1].timestamp)
      if (gap <= CAMPAIGN_WINDOW_MS) {
        cluster.push(sorted[i])
      } else {
        clusters.push({ key, cluster })
        cluster = [sorted[i]]
      }
    }
    clusters.push({ key, cluster })
  }
  return clusters
}

function buildCampaign(key, cluster, correlationType) {
  const distinctVictims = new Set(cluster.map(i => i.victim?.asn))
  const sectors = [...new Set(cluster.map(i => i.victim?.sector).filter(Boolean))]
  return {
    campaignId: `CAMPAIGN-${correlationType}-${key}-${cluster[0].id}`,
    correlationType,
    attackerAsn: correlationType === 'same-asn' ? key : null,
    attackerCountry: correlationType === 'same-country' ? key : (cluster[0].attacker?.country ?? '??'),
    attackerName: correlationType === 'same-asn' ? (cluster[0].attacker?.name ?? key) : null,
    attackerAsns: [...new Set(cluster.map(i => i.attacker?.asn).filter(Boolean))],
    incidents: [...cluster],
    incidentIds: cluster.map(i => i.id),
    victimCount: distinctVictims.size,
    sectors,
    firstSeen: cluster[0].timestamp,
    lastSeen: cluster[cluster.length - 1].timestamp,
    maxSeverity: cluster.some(i => i.severity === 'CRITICAL') ? 'CRITICAL'
      : cluster.some(i => i.severity === 'HIGH') ? 'HIGH' : 'MEDIUM',
  }
}

/**
 * Groups incidents into campaigns. Tier 1 (same-asn) runs first and is the
 * strong signal; tier 2 (same-country) only considers incidents not
 * already claimed by a tier-1 campaign, and requires genuinely different
 * ASNs — not just a fuzzier re-statement of the same cluster.
 */
export function detectCampaigns(incidents) {
  const asnCampaigns = clusterByKey(incidents, inc => inc.attacker?.asn)
    .filter(({ cluster }) => new Set(cluster.map(i => i.victim?.asn)).size >= 2)
    .map(({ key, cluster }) => buildCampaign(key, cluster, 'same-asn'))

  const claimedIds = new Set(asnCampaigns.flatMap(c => c.incidentIds))
  const remaining  = incidents.filter(i => !claimedIds.has(i.id))

  const countryCampaigns = clusterByKey(remaining, inc => inc.attacker?.country)
    .filter(({ cluster }) => {
      const distinctVictims = new Set(cluster.map(i => i.victim?.asn)).size
      const distinctAsns    = new Set(cluster.map(i => i.attacker?.asn).filter(Boolean)).size
      // Requires genuinely different attacker ASNs, not just different
      // victims from what would already be a same-ASN campaign.
      return distinctVictims >= 2 && distinctAsns >= 2
    })
    .map(({ key, cluster }) => buildCampaign(key, cluster, 'same-country'))

  return [...asnCampaigns, ...countryCampaigns].sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
}

/** Returns the active campaign (if any) that a specific incident belongs to. */
export function findCampaignForIncident(incident, allIncidents) {
  const campaigns = detectCampaigns(allIncidents)
  return campaigns.find(c => c.incidentIds.includes(incident.id)) ?? null
}
