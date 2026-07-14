// Scrutari Geolocation Abstraction
// Provider-agnostic interface for IP geolocation.
// Supports Netlify Edge (context.geo), MaxMind GeoLite2, ipinfo.io, etc.
//
// Usage:
//   import { getGeolocation } from './lib/geo.js';
//   const geo = await getGeolocation(ip, provider);
//   // { ip, country, region, city, loc, timezone, org, asn, type, risk }

// Geolocation result schema
// All fields are strings; unknown fields default to 'unknown'
export class GeolocationResult {
  constructor(data = {}) {
    this.ip = data.ip || 'unknown';
    this.country = data.country || 'unknown';
    this.region = data.region || 'unknown';
    this.city = data.city || 'unknown';
    this.loc = data.loc || 'unknown';
    this.timezone = data.timezone || 'unknown';
    this.org = data.org || 'unknown';
    this.asn = data.asn || null;
    this.type = data.type || 'Unknown';
    this.risk = data.risk || 'unknown';
  }
}

// Get geolocation from any configured provider
// provider: an object with a `lookup(ip)` method returning GeolocationResult
export async function getGeolocation(ip, provider) {
  if (!provider || typeof provider.lookup !== 'function') {
    throw new Error('Geolocation provider must implement lookup(ip) method');
  }
  return provider.lookup(ip);
}

// Normalize IP for consistent lookups
export function normalizeIP(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}
