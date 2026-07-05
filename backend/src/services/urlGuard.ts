import net from 'net';
import { promises as dns } from 'dns';

/**
 * SSRF guard for server-side fetches of admin-configurable URLs (calendar import
 * source, court news website). Rejects anything that isn't plain http(s) or that
 * targets a private / loopback / link-local / reserved network — including hosts
 * that *resolve* to such an address, and cloud metadata endpoints
 * (169.254.169.254). Call it before every request, including on each redirect.
 *
 * Note: this is a resolve-time check, so a determined DNS-rebinding attacker could
 * still race the subsequent connect. Because these URLs come from authenticated
 * admins (not the public), this proportionately blocks the realistic threats:
 * misconfiguration and crafted settings imports pointed at internal infrastructure.
 */

const blocked = new net.BlockList();
// IPv4 non-public / special-use ranges (RFC 1918, 5735, 6598, 6890, etc.)
blocked.addSubnet('0.0.0.0', 8, 'ipv4');        // "this" network
blocked.addSubnet('10.0.0.0', 8, 'ipv4');       // private
blocked.addSubnet('100.64.0.0', 10, 'ipv4');    // carrier-grade NAT
blocked.addSubnet('127.0.0.0', 8, 'ipv4');      // loopback
blocked.addSubnet('169.254.0.0', 16, 'ipv4');   // link-local (incl. cloud metadata)
blocked.addSubnet('172.16.0.0', 12, 'ipv4');    // private
blocked.addSubnet('192.0.0.0', 24, 'ipv4');     // IETF protocol assignments
blocked.addSubnet('192.168.0.0', 16, 'ipv4');   // private
blocked.addSubnet('198.18.0.0', 15, 'ipv4');    // benchmarking
blocked.addSubnet('224.0.0.0', 4, 'ipv4');      // multicast
blocked.addSubnet('240.0.0.0', 4, 'ipv4');      // reserved
// IPv6
blocked.addAddress('::1', 'ipv6');              // loopback
blocked.addSubnet('fc00::', 7, 'ipv6');         // unique local
blocked.addSubnet('fe80::', 10, 'ipv6');        // link-local

/** Normalize an address, unwrapping IPv4-mapped IPv6 (e.g. ::ffff:10.0.0.1). */
function normalize(addr: string): { ip: string; family: 'ipv4' | 'ipv6' } {
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return { ip: mapped[1], family: 'ipv4' };
  return { ip: addr, family: net.isIPv6(addr) ? 'ipv6' : 'ipv4' };
}

/** True if the given IP literal is in a blocked (non-public) range. */
export function isBlockedAddress(addr: string): boolean {
  const { ip, family } = normalize(addr);
  if (net.isIP(ip) === 0) return true; // unparseable → treat as unsafe
  return blocked.check(ip, family);
}

/**
 * Throw if `url` is not a public http(s) URL. Resolves the hostname and checks
 * every returned address so a DNS name pointing at an internal IP is also rejected.
 */
export async function assertPublicHttpUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  // Strip brackets from IPv6 literals (new URL keeps them in hostname).
  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host) !== 0) {
    if (isBlockedAddress(host)) {
      throw new Error(`Refusing to fetch private/reserved address: ${host}`);
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve host: ${host}`);
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new Error(
        `Refusing to fetch host resolving to private/reserved address: ${host} -> ${address}`
      );
    }
  }
}
