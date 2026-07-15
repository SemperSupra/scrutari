// @ts-check
// Scrutari Geolocation Abstraction
// Provider-agnostic interface for IP geolocation.

/** @typedef {{ ip?: string, country?: string, region?: string, city?: string, loc?: string, timezone?: string, org?: string, asn?: string|null, type?: string, risk?: string }} GeoData */

// Geolocation result schema
export class GeolocationResult {
  /** @param {GeoData} data */
  constructor(data = {}) {
    /** @type {string} */
    this.ip = data.ip || 'unknown';
    /** @type {string} */
    this.country = data.country || 'unknown';
    /** @type {string} */
    this.region = data.region || 'unknown';
    /** @type {string} */
    this.city = data.city || 'unknown';
    /** @type {string} */
    this.loc = data.loc || 'unknown';
    /** @type {string} */
    this.timezone = data.timezone || 'unknown';
    /** @type {string} */
    this.org = data.org || 'unknown';
    /** @type {string|null} */
    this.asn = data.asn || null;
    /** @type {string} */
    this.type = data.type || 'Unknown';
    /** @type {string} */
    this.risk = data.risk || 'unknown';
  }
}

/** @param {string} ip @param {{ lookup: (ip: string) => Promise<GeolocationResult> }} provider @returns {Promise<GeolocationResult>} */
export async function getGeolocation(ip, provider) {
  if (!provider || typeof provider.lookup !== 'function') {
    throw new Error('Geolocation provider must implement lookup(ip) method');
  }
  return provider.lookup(ip);
}

/** @param {string} ip @returns {string} */
export function normalizeIP(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}
