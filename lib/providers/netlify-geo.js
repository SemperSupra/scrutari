// Scrutari Geolocation Provider: Netlify Edge
// Uses Netlify's built-in context.geo for geolocation.
// Free tier includes country, region, city, timezone.
// Pro/Enterprise adds ASN and org.

import { GeolocationResult } from '../geo.js';

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

// Tor exit list URL — fetched and cached
const TOR_EXIT_URL = 'https://check.torproject.org/exit-addresses';
let torCache = { ips: new Set(), updated: 0 };
const TOR_CACHE_TTL = 3600000; // 1 hour

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
    return ips;
  } catch (e) {
    return torCache.ips;
  }
}

// Netlify Edge geolocation provider
// Usage:
//   import { NetlifyGeoProvider } from './lib/providers/netlify-geo.js';
//   const geo = await provider.lookup(clientIP, { geo: context.geo });
export class NetlifyGeoProvider {
  async lookup(ip, options = {}) {
    const geo = options.geo || {};
    const result = new GeolocationResult({
      ip,
      country: geo.country?.code || 'unknown',
      region: geo.subdivision?.code || geo.subdivision?.name || geo.region || 'unknown',
      city: geo.city || 'unknown',
      loc: geo.latitude && geo.longitude ? `${geo.latitude},${geo.longitude}` : 'unknown',
      timezone: geo.timezone || 'unknown',
      org: `ASN ${geo.asn || 'unknown'}`,
    });

    // Tor exit check
    const torExits = await fetchTorExits();
    const isTor = torExits.has(ip);
    if (isTor) {
      result.type = 'Tor Exit';
      result.risk = 'high';
      result.org = 'Tor Exit Node';
    } else if (geo.asn) {
      const classification = classifyOrg(geo.org || `AS${geo.asn}`);
      result.type = classification.type;
      result.risk = classification.risk;
      result.org = geo.org || `AS${geo.asn}`;
    }

    return result;
  }
}
