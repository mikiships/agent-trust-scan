import { lookup } from 'dns/promises';
import { isIP } from 'net';
import ipaddr from 'ipaddr.js';

/**
 * KNOWN LIMITATION: DNS TOCTOU (Time-of-Check-to-Time-of-Use)
 *
 * The check-then-connect pattern used in safeFetch() and checkTLS() has an
 * inherent TOCTOU gap: DNS is resolved here for validation, but the actual
 * HTTP connection resolves DNS again independently. A malicious DNS server
 * could return a safe IP during our check and a private/reserved IP during
 * the real connection (DNS rebinding attack).
 *
 * A proper fix would require custom DNS resolution pinning — e.g., using
 * Node's `http.Agent` with a custom `lookup` function that resolves DNS
 * once, validates the result, and pins that IP for the actual connection.
 * This is complex to implement correctly across HTTP/HTTPS and is deferred
 * to a future version.
 */

/**
 * Check if an IPv4 address is in a private or reserved range
 */
function isPrivateOrReservedIPv4(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    if (addr.kind() !== 'ipv4') return false;
    
    const range = (addr as ipaddr.IPv4).range();
    
    // Only block actual private/reserved ranges
    // ipaddr.js returns 'unicast' for public IPs - those are safe
    return (
      range === 'private' ||
      range === 'loopback' ||
      range === 'linkLocal' ||
      range === 'broadcast' ||
      range === 'unspecified' ||
      range === 'reserved' ||
      range === 'multicast' ||
      range === 'carrierGradeNat'  // RFC6598 100.64.0.0/10 - shared address space, not public
    );
  } catch {
    // If parsing fails, fail safe by rejecting
    return true;
  }
}

/**
 * Check if an IP address is in a private or reserved range
 * Properly handles IPv4-mapped IPv6 addresses in all formats
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    
    if (addr.kind() === 'ipv4') {
      return isPrivateOrReservedIPv4(ip);
    } else if (addr.kind() === 'ipv6') {
      const ipv6Addr = addr as ipaddr.IPv6;
      
      // Check if it's an IPv4-mapped IPv6 address (::ffff:x.x.x.x)
      // This catches all forms: compressed, expanded, etc.
      if (ipv6Addr.isIPv4MappedAddress()) {
        // Convert to IPv4 and check private ranges
        const ipv4 = ipv6Addr.toIPv4Address().toString();
        return isPrivateOrReservedIPv4(ipv4);
      }
      
      // Check IPv6 special-use ranges
      const range = ipv6Addr.range();
      // ipaddr.js returns 'unicast' for public IPv6 - those are safe
      return (
        range === 'loopback' ||          // ::1/128
        range === 'linkLocal' ||         // fe80::/10
        range === 'uniqueLocal' ||       // fc00::/7
        range === 'unspecified' ||       // ::/128
        range === 'multicast' ||         // ff00::/8
        range === 'reserved'             // Other reserved ranges
      );
    }
    
    return false;
  } catch {
    // If parsing fails, fail safe by rejecting
    return true;
  }
}

/**
 * Validate that a domain is safe to scan (not private/reserved IP)
 * Resolves DNS first, then checks all resolved IPs
 * 
 * NOTE: This validation is called once at scan start. DNS rebinding attacks
 * (where DNS changes between validation and fetch) are mitigated by safeFetch(),
 * which re-validates DNS on every request including redirects.
 */
export async function validateDomain(domain: string): Promise<{ valid: boolean; reason?: string }> {
  // Reject inputs containing URL special characters that could bypass validation
  const invalidChars = ['#', '?', '/', '\\', ' ', '\t', '\n', '\r'];
  for (const char of invalidChars) {
    if (domain.includes(char)) {
      return { valid: false, reason: `Domain contains invalid character: ${char}` };
    }
  }
  
  // Check for control characters
  if (/[\x00-\x1F\x7F]/.test(domain)) {
    return { valid: false, reason: 'Domain contains control characters' };
  }
  
  // Check if domain contains userinfo (user:pass@)
  if (domain.includes('@')) {
    return { valid: false, reason: 'Domain contains userinfo (user:pass@host)' };
  }
  
  // Parse as URL to validate structure
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(`https://${domain}`);
  } catch (error) {
    return { valid: false, reason: 'Invalid domain format' };
  }
  
  // Verify URL components are clean (no path, query, or fragment)
  if (parsedUrl.pathname !== '/') {
    return { valid: false, reason: 'Domain contains path component' };
  }
  if (parsedUrl.search !== '') {
    return { valid: false, reason: 'Domain contains query string' };
  }
  if (parsedUrl.hash !== '') {
    return { valid: false, reason: 'Domain contains fragment' };
  }
  
  // Extract hostname (handles both regular hostnames and IPv6 literals)
  const hostname = parsedUrl.hostname;
  
  // Check if it's already an IP address
  const ipType = isIP(hostname);
  if (ipType !== 0) {
    if (isPrivateOrReservedIP(hostname)) {
      return { valid: false, reason: `Private or reserved IP address: ${hostname}` };
    }
    return { valid: true };
  }
  
  // Check for localhost variants
  if (hostname.toLowerCase() === 'localhost') {
    return { valid: false, reason: 'localhost is not allowed' };
  }
  
  // Resolve DNS to get IP addresses
  try {
    const addresses = await lookup(hostname, { all: true });
    
    for (const { address } of addresses) {
      if (isPrivateOrReservedIP(address)) {
        return { 
          valid: false, 
          reason: `Domain ${hostname} resolves to private/reserved IP: ${address}` 
        };
      }
    }
    
    return { valid: true };
  } catch (error: any) {
    // DNS resolution failure - fail closed (reject)
    return { 
      valid: false, 
      reason: `DNS lookup failed for ${hostname}: ${error.code || 'unknown error'}` 
    };
  }
}
