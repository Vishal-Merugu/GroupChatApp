import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

import { ValidationError } from '../errors/app-error';

/**
 * True for any IPv4 address that is not routable on the public internet —
 * loopback, private ranges, link-local, carrier-grade NAT, and the various
 * reserved/test blocks. Not exhaustive of every RFC 5735/6598 entry, but
 * covers everything a cloud metadata endpoint or internal service would use.
 */
function isPrivateIPv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) {
    return true; // Malformed — refuse rather than guess.
  }
  const [a, b] = octets as [number, number, number, number];

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a >= 224) return true; // multicast (224.0.0.0/4) and reserved (240.0.0.0/4)

  return false;
}

/** IPv6 loopback, unique-local, and link-local ranges, plus embedded IPv4. */
function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') {
    return true;
  }
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true; // link-local (fe80::/10) and unique-local (fc00::/7)
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped?.[1]) {
    return isPrivateIPv4(mapped[1]);
  }
  return false;
}

function isPrivateAddress(address: string): boolean {
  if (isIPv4(address)) {
    return isPrivateIPv4(address);
  }
  if (isIPv6(address)) {
    return isPrivateIPv6(address);
  }
  return true; // Not a recognizable IP — refuse.
}

/**
 * Guards against SSRF on user-supplied provider base URLs.
 *
 * A credential's base URL (Cloudflare's account-specific endpoint, or any
 * "custom" OpenAI-compatible URL) is attacker-controlled input the server will
 * make outbound requests to. Without this check, a user could point a
 * credential at an internal service or a cloud metadata endpoint and use the
 * server as a proxy into it. Every resolved address is checked, not just the
 * first, since DNS can return a mix or rotate between calls.
 *
 * Known gap: this checks DNS at save-time, not at each request. A host that
 * resolves publicly now and privately later (DNS rebinding) would pass this
 * check and still reach an internal address on a later LLM call. Acceptable
 * for a portfolio-scale deployment; a production system would also pin the
 * resolved IP for the actual outbound connection.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ValidationError('That base URL is not valid');
  }

  if (url.protocol !== 'https:') {
    throw new ValidationError('The base URL must use https');
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new ValidationError('Could not resolve that host');
  }

  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new ValidationError('That base URL points to a private or reserved address');
  }
}
