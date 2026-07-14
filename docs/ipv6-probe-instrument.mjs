#!/usr/bin/env node
/**
 * IPv6 Probe Reliability Experiment — Reference Implementation
 *
 * This is the JavaScript probe instrument that should be deployed to
 * the SPA for data collection. It records per-endpoint results so we
 * can determine optimal probe parameters (Phase 5.1 → PR 1.2).
 *
 * The experiment hypothesis: 2/3 endpoint consensus reduces false
 * negatives vs single-endpoint without increasing false positives.
 *
 * Deployment: Integrate into index.html's probeIPv6Connectivity()
 *
 * Results schema:
 *   ipv6ProbeResults: {
 *     endpoints: { "url": { reachable, rtt } },
 *     controlV4: { reachable, rtt },
 *     webrtcIPv6Candidates: number,   // from WebRTC STUN test
 *     ipVersion: "IPv4" | "IPv6",
 *     networkType: "wifi" | "cellular" | "ethernet" | null
 *   }
 */

const IPV6_ENDPOINTS = [
  'https://ipv6.test-ipv6.com/',
  'https://ipv6.l.google.com/',
  'https://v6.ident.me/',
];
const IPV4_CONTROL = 'https://ipv4.test-ipv6.com/';
const PROBE_TIMEOUT = 3000; // ms per endpoint

async function probeEndpoint(url, signal) {
  const start = performance.now();
  try {
    const resp = await fetch(url, { signal, mode: 'no-cors' });
    // no-cors mode: any response means the endpoint was reachable
    return { reachable: true, rtt: Math.round(performance.now() - start) };
  } catch (e) {
    return { reachable: false, rtt: null, error: e.message };
  }
}

async function instrumentedIPv6Probe() {
  const results = { endpoints: {}, controlV4: null, webrtcIPv6Candidates: 0, ipVersion: 'unknown', networkType: null };

  // Probe each IPv6 endpoint
  for (const url of IPV6_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    results.endpoints[url] = await probeEndpoint(url, controller.signal);
    clearTimeout(timeout);
  }

  // IPv4 control
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    results.controlV4 = await probeEndpoint(IPV4_CONTROL, controller.signal);
    clearTimeout(timeout);
  } catch (e) {
    results.controlV4 = { reachable: false, rtt: null, error: e.message };
  }

  // Ground truth from WebRTC (if available)
  try {
    // This is populated by the WebRTC STUN test elsewhere in the SPA
    if (window.__webrtcIPv6Count !== undefined) {
      results.webrtcIPv6Candidates = window.__webrtcIPv6Count;
    }
    if (window.__ipVersion) {
      results.ipVersion = window.__ipVersion;
    }
  } catch (e) {}

  // Network type
  try {
    if (navigator.connection && navigator.connection.effectiveType) {
      results.networkType = navigator.connection.effectiveType;
    }
  } catch (e) {}

  return results;
}

// Consensus logic (to be determined by experiment)
function consensus2of3(endpoints) {
  const successes = Object.values(endpoints).filter(e => e.reachable).length;
  return successes >= 2;
}

// Export for integration into SPA
export { instrumentedIPv6Probe, consensus2of3, IPV6_ENDPOINTS, IPV4_CONTROL };
