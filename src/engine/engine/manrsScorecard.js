/**
 * MANRS Compliance Scorecard
 *
 * MANRS (Mutually Agreed Norms for Routing Security) is the real Internet
 * Society industry framework — manrs.org — defining 4 concrete actions for
 * network operators. Extends the existing RPKI Gap Scanner to frame its
 * findings against this real, citable standard instead of an invented
 * scoring system.
 *
 * IMPORTANT — measured vs. not measured:
 *   SHYEN's actual data sources (live RPKI validity, RIPE RIS, RIPE STAT)
 *   can genuinely measure ROA publication — that's action #4, Global
 *   Validation. The other three MANRS actions (Filtering, Anti-Spoofing,
 *   Coordination) require data SHYEN does not have access to — customer
 *   filtering policy, source-address validation at the data plane, and
 *   PeeringDB/IRR contact records respectively. Rather than fabricate
 *   scores for those, this module explicitly marks them unmeasured. A
 *   scorecard that's honest about 1-of-4 is more credible than one that
 *   fakes 4-of-4.
 */

export const MANRS_ACTIONS = [
  {
    id: 'filtering',
    name: 'Filtering',
    description: 'Prevent propagation of incorrect routing information by ensuring the correctness of announcements from your own network and customer networks, with prefix and AS-path granularity.',
    measurable: false,
    reason: 'Requires visibility into an operator\'s customer-filtering policy, which isn\'t observable from public BGP feeds or RPKI data alone.',
  },
  {
    id: 'antispoofing',
    name: 'Anti-Spoofing',
    description: 'Prevent traffic with spoofed source IP addresses from leaving your network.',
    measurable: false,
    reason: 'A data-plane property — requires packet-level testing (e.g. the Spoofer project\'s methodology), not observable from routing-table data.',
  },
  {
    id: 'coordination',
    name: 'Coordination',
    description: 'Maintain globally accessible, up-to-date contact information in PeeringDB and relevant IRR/RIR databases to facilitate operational communication.',
    measurable: false,
    reason: 'Requires querying PeeringDB and IRR records directly — not currently integrated into HexaSentinel\'s data sources.',
  },
  {
    id: 'validation',
    name: 'Global Validation',
    description: 'Publish routing information (Route Origin Authorizations) so other networks can validate your announcements, and validate others\' announcements yourself.',
    measurable: true,
    reason: 'Directly measured by the RPKI Gap Scanner — real, live ROA coverage data from Cloudflare\'s RPKI API.',
  },
]

/**
 * Builds the scorecard from the RPKI Gap Scanner's summarizeGaps() output.
 * Only action #4 gets a real numeric score; the other three are returned
 * with measurable:false so the UI can render them as "framework context",
 * not fake compliance numbers.
 */
export function computeManrsScorecard(gapSummary) {
  const validationScore = gapSummary ? gapSummary.coveragePct : null

  return {
    actions: MANRS_ACTIONS.map(action =>
      action.id === 'validation'
        ? { ...action, score: validationScore, coveredCount: gapSummary?.coveredCount, totalCount: gapSummary?.total }
        : { ...action, score: null }
    ),
    measurableCount: MANRS_ACTIONS.filter(a => a.measurable).length,
    totalActions: MANRS_ACTIONS.length,
  }
}
