// Netlify Edge Function: IP Classification
// Replaces the ipinfo.io third-party call in the SPA.
// Uses Netlify's built-in geolocation (free, no additional API calls).
// Classifies IP as residential, datacenter, VPN, or Tor exit.
//
// Endpoint: /.netlify/edge-functions/classify
// Response: { ip, country, region, city, timezone, loc, org, type, risk }

// Known VPN provider substrings (org field)
const VPN_PROVIDERS = [
  'mullvad', 'nordvpn', 'expressvpn', 'cyberghost', 'private internet access',
  'protonvpn', 'surfshark', 'windscribe', 'vyprvpn', 'torguard', 'ivpn',
  'airvpn', 'perfect privacy', 'zerotier', 'tailscale', 'headscale',
  'openvpn', 'wireguard', 'hidemyass', 'purevpn', 'safervpn',
];

// Known cloud/datacenter providers
const DATACENTER_PROVIDERS = [
  'amazon', 'aws', 'google cloud', 'gcp', 'microsoft azure', 'azure',
  'digitalocean', 'linode', 'vultr', 'hetzner', 'ovh', 'scaleway', 'contabo',
  'oracle cloud', 'ibm cloud', 'alibaba cloud', 'rackspace', 'kinsta',
  'cloudflare', 'akamai', 'fastly', 'verizon digital media',
];

// Tor exit list URL — fetched and cached
const TOR_EXIT_URL = 'https://check.torproject.org/exit-addresses';
let torCache = { ips: new Set(), updated: 0 };
const TOR_CACHE_TTL = 3600000; // 1 hour

// Normalize IP address for consistent Tor exit checking
function normalizeIP(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

async function fetchTorExits() {
  const now = Date.now();
  if (now - torCache.updated < TOR_CACHE_TTL) return torCache.ips;
  try {
    const resp = await fetch(TOR_EXIT_URL);
    const text = await resp.text();
    const ips = new Set();
    for (const line of text.split('\n')) {
      if (line.startsWith('ExitAddress ')) {
        const ip = line.split(' ')[1];
        if (ip) ips.add(ip);
      }
    }
    torCache = { ips, updated: now };
    console.log(`Tor exit list updated: ${ips.size} nodes`);
    return ips;
  } catch (e) {
    console.error('Tor list fetch failed:', e.message);
    return torCache.ips;
  }
}

function classifyOrg(org) {
  if (!org) return { type: 'Unknown', risk: 'unknown' };
  const lower = org.toLowerCase();
  for (const v of VPN_PROVIDERS) { if (lower.includes(v)) return { type: 'VPN', risk: 'low' }; }
  for (const d of DATACENTER_PROVIDERS) { if (lower.includes(d)) return { type: 'Datacenter', risk: 'medium' }; }
  if (lower.includes('hosting') || lower.includes('data center') || lower.includes('datacenter') || lower.includes('colo')) {
    return { type: 'Datacenter', risk: 'medium' };
  }
  return { type: 'Likely Residential', risk: 'low' };
}

export default async (req, context) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  try {
    // Get geolocation from Netlify Edge (free tier)
    const geo = context.geo || {};
    const rawClientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                     || req.headers.get('x-nf-client-connection-ip')
                     || 'unknown';
    const clientIP = normalizeIP(rawClientIP);

    // Get org/hostname from reverse DNS (optional — may not always have data)
    // Netlify doesn't provide org directly, so we derive it from IP reputation
    // For now, we use the client IP and geolocation
    const response = {
      ip: clientIP,
      country: geo.country?.code || 'unknown',
      region: geo.subdivision?.code || geo.subdivision?.name || geo.region || 'unknown',
      city: geo.city || 'unknown',
      loc: geo.latitude && geo.longitude ? `${geo.latitude},${geo.longitude}` : 'unknown',
      timezone: geo.timezone || 'unknown',
      org: `ASN ${geo.asn || 'unknown'}`, // Netlify free tier may not include ASN
      type: 'Unknown',
      risk: 'unknown',
    };

    // Tor exit check
    const torExits = await fetchTorExits();
    const isTor = torExits.has(clientIP);
    if (isTor) {
      response.type = 'Tor Exit';
      response.risk = 'high';
      response.org = 'Tor Exit Node';
    } else {
      // For non-Tor, we can't fully classify without ASN/org data.
      // On Netlify Pro/Enterprise, context.geo includes asn and org.
      // On free tier, we use the available data.
      if (geo.asn) {
        const classification = classifyOrg(geo.org || `AS${geo.asn}`);
        response.type = classification.type;
        response.risk = classification.risk;
        response.org = geo.org || `AS${geo.asn}`;
      }
    }

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
};
