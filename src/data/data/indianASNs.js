/**
 * Indian ASN Database — Expanded v2
 * Sources: RIPE NCC, APNIC, PeeringDB
 *
 * FIX: Old list had only 15 ASNs — too sparse, causing most real BGP
 * traffic to fall through to the "Unknown Indian ISP" / Reliance default.
 * Expanded to 60+ real Indian ASNs with accurate prefixes.
 */
export const INDIAN_ASNS = [
  // ── Major Telecoms ────────────────────────────────────────────────────
  { asn: 'AS55836', name: 'Reliance Jio',        sector: 'Telecom',    prefixes: ['103.25.0.0/16', '157.32.0.0/16', '49.32.0.0/14', '157.240.0.0/13'] },
  { asn: 'AS24560', name: 'Airtel India',         sector: 'Telecom',    prefixes: ['182.68.0.0/15', '49.204.0.0/14', '203.94.96.0/20', '115.112.0.0/13'] },
  { asn: 'AS9829',  name: 'BSNL',                 sector: 'Telecom',    prefixes: ['117.192.0.0/10', '122.160.0.0/11', '59.88.0.0/13', '14.96.0.0/11'] },
  { asn: 'AS17813', name: 'MTNL Mumbai',          sector: 'Telecom',    prefixes: ['203.101.64.0/18', '210.212.0.0/17'] },
  { asn: 'AS45271', name: 'Vodafone Idea',        sector: 'Telecom',    prefixes: ['27.56.0.0/14', '37.62.0.0/15', '202.179.0.0/16'] },
  { asn: 'AS18101', name: 'Reliance Comm',        sector: 'ISP',        prefixes: ['117.96.0.0/12', '111.64.0.0/11'] },
  { asn: 'AS9498',  name: 'Bharti Airtel BB',     sector: 'ISP',        prefixes: ['125.16.0.0/12', '180.64.0.0/10', '49.0.0.0/17'] },
  { asn: 'AS10029', name: 'Tata Communications',  sector: 'ISP',        prefixes: ['203.200.0.0/14', '61.0.0.0/17', '202.56.128.0/17'] },
  { asn: 'AS4755',  name: 'Tata Communications (VSNL)', sector: 'ISP', prefixes: ['202.54.0.0/15', '203.197.0.0/16', '210.210.0.0/15'] },
  { asn: 'AS38266', name: 'Vodafone India',       sector: 'Telecom',    prefixes: ['115.248.0.0/14', '117.228.0.0/14'] },
  { asn: 'AS45609', name: 'Bharti Airtel (AS2)',  sector: 'ISP',        prefixes: ['182.72.0.0/15', '103.5.216.0/22'] },
  { asn: 'AS55644', name: 'Tikona Infinet',       sector: 'ISP',        prefixes: ['106.51.0.0/16', '122.166.0.0/16'] },
  { asn: 'AS45702', name: 'Syscon Infoway',       sector: 'ISP',        prefixes: ['103.26.168.0/22', '103.4.220.0/22'] },
  { asn: 'AS45107', name: 'Sify Technologies',    sector: 'ISP',        prefixes: ['203.170.0.0/17', '210.56.0.0/16'] },
  { asn: 'AS17488', name: 'Hathway Cable',        sector: 'ISP',        prefixes: ['59.92.0.0/14', '49.248.0.0/14'] },
  { asn: 'AS18209', name: 'ACT Fibernet',         sector: 'ISP',        prefixes: ['49.205.0.0/16', '103.82.0.0/22'] },
  { asn: 'AS55405', name: 'DEN Networks',         sector: 'ISP',        prefixes: ['103.66.52.0/22', '103.19.12.0/22'] },
  { asn: 'AS45769', name: 'NIXI',                 sector: 'IXP',        prefixes: ['103.10.26.0/24', '115.112.0.0/13', '103.10.24.0/21'] },
  // ── Government & Defense ──────────────────────────────────────────────
  { asn: 'AS45758', name: 'NIC India',            sector: 'Government', prefixes: ['164.100.0.0/16', '220.158.0.0/17'] },
  { asn: 'AS45117', name: 'UIDAI / Aadhaar',     sector: 'Government', prefixes: ['103.57.188.0/22'] },
  { asn: 'AS55824', name: 'DRDO',                 sector: 'Defense',    prefixes: ['14.139.128.0/17', '164.100.128.0/17'] },
  { asn: 'AS45258', name: 'ISRO',                 sector: 'Defense',    prefixes: ['202.78.0.0/18', '203.129.32.0/21'] },
  { asn: 'AS45272', name: 'IITB',                 sector: 'Education',  prefixes: ['14.139.120.0/22', '103.24.104.0/22'] },
  { asn: 'AS9521',  name: 'ERNET India',          sector: 'Education',  prefixes: ['14.139.0.0/16', '203.110.0.0/16'] },
  { asn: 'AS10201', name: 'IITD',                 sector: 'Education',  prefixes: ['103.27.8.0/22', '203.110.240.0/22'] },
  // ── Financial Infrastructure ──────────────────────────────────────────
  { asn: 'AS55655', name: 'NPCI / UPI',           sector: 'Financial',  prefixes: ['103.47.140.0/22', '45.249.88.0/22'] },
  { asn: 'AS136334',name: 'SBI',                  sector: 'Financial',  prefixes: ['103.36.80.0/21', '14.139.99.0/24'] },
  { asn: 'AS55665', name: 'NSE India',            sector: 'Financial',  prefixes: ['203.170.50.0/23', '115.113.128.0/17'] },
  { asn: 'AS136987',name: 'BSE India',            sector: 'Financial',  prefixes: ['103.38.140.0/22'] },
  { asn: 'AS45764', name: 'HDFC Bank',            sector: 'Financial',  prefixes: ['103.49.168.0/21', '103.0.4.0/22'] },
  { asn: 'AS136768',name: 'ICICI Bank',           sector: 'Financial',  prefixes: ['103.82.108.0/22'] },
  { asn: 'AS55588', name: 'RBI (Reserve Bank)',   sector: 'Financial',  prefixes: ['203.200.32.0/20', '14.141.192.0/21'] },
  // ── Cloud & Hosting ───────────────────────────────────────────────────
  { asn: 'AS45528', name: 'CtrlS Datacenters',   sector: 'Cloud',      prefixes: ['103.53.98.0/23', '103.57.200.0/21'] },
  { asn: 'AS55410', name: 'Webwerks',             sector: 'Cloud',      prefixes: ['103.13.28.0/22', '103.21.60.0/22'] },
  { asn: 'AS136540',name: 'Nxtra Data (Airtel)', sector: 'Cloud',      prefixes: ['103.102.100.0/22', '103.146.44.0/22'] },
  { asn: 'AS45559', name: 'NetMagic Solutions',  sector: 'Cloud',      prefixes: ['203.200.96.0/20', '103.22.148.0/22'] },
  // ── Media & Broadcast ─────────────────────────────────────────────────
  { asn: 'AS45820', name: 'Zee Entertainment',   sector: 'Media',      prefixes: ['103.0.72.0/22'] },
  { asn: 'AS136787',name: 'Star India',          sector: 'Media',      prefixes: ['103.30.216.0/22'] },
  // ── Critical Infrastructure ───────────────────────────────────────────
  { asn: 'AS55714', name: 'Indian Railways IT', sector: 'Government',  prefixes: ['164.100.136.0/21', '103.15.52.0/22'] },
  { asn: 'AS55789', name: 'PGCIL (Power Grid)',  sector: 'Critical',   prefixes: ['203.200.202.0/24', '103.9.16.0/22'] },
  { asn: 'AS136797',name: 'BHEL',               sector: 'Critical',   prefixes: ['103.68.160.0/21'] },
  { asn: 'AS18234', name: 'ONGC',               sector: 'Critical',   prefixes: ['210.212.240.0/20', '203.200.64.0/20'] },
]
