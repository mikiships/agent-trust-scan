import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Check if an IP address is in a private or reserved range
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  const ipType = isIP(ip);
  
  if (ipType === 4) {
    // IPv4 private/reserved ranges
    const parts = ip.split('.').map(Number);
    
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    
    // 255.255.255.255/32 (broadcast)
    if (parts[0] === 255 && parts[1] === 255 && parts[2] === 255 && parts[3] === 255) return true;
    
    return false;
  } else if (ipType === 6) {
    // IPv6 private/reserved ranges
    const lower = ip.toLowerCase();
    
    // ::1 (loopback)
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    
    // fc00::/7 (unique local)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    
    // fe80::/10 (link-local)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || 
        lower.startsWith('fea') || lower.startsWith('feb')) return true;
    
    // ::ffff:0:0/96 (IPv4-mapped IPv6)
    if (lower.includes('::ffff:')) return true;
    
    return false;
  }
  
  return false;
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
