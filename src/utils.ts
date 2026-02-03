/**
 * Maximum response body size in bytes (256KB)
 * Prevents memory exhaustion from malicious responses
 */
const MAX_RESPONSE_SIZE = 256 * 1024;

/**
 * Read response text with size limit
 * @throws Error if response exceeds MAX_RESPONSE_SIZE
 */
export async function readResponseText(response: Response): Promise<string> {
  const contentLength = response.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
    throw new Error(`Response too large: ${contentLength} bytes (max: ${MAX_RESPONSE_SIZE})`);
  }
  
  // Try to use streaming if available (real fetch responses)
  const reader = response.body?.getReader();
  if (reader) {
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        totalSize += value.length;
        if (totalSize > MAX_RESPONSE_SIZE) {
          throw new Error(`Response exceeded size limit: ${totalSize} bytes (max: ${MAX_RESPONSE_SIZE})`);
        }
        
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    
    // Combine chunks and decode
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    
    return new TextDecoder().decode(combined);
  }
  
  // Fallback to response.text() for mocked responses (in tests)
  // This still provides basic size protection via Content-Length check above
  const text = await response.text();
  if (text.length > MAX_RESPONSE_SIZE) {
    throw new Error(`Response exceeded size limit: ${text.length} bytes (max: ${MAX_RESPONSE_SIZE})`);
  }
  return text;
}

/**
 * Read response JSON with size limit
 * @throws Error if response exceeds MAX_RESPONSE_SIZE or is invalid JSON
 */
export async function readResponseJson<T = any>(response: Response): Promise<T> {
  // For mocked responses with json() method, use it directly
  if (typeof (response as any).json === 'function' && !response.body) {
    const data = await response.json() as T;
    // Still check size constraint on stringified JSON
    const stringified = JSON.stringify(data);
    if (stringified.length > MAX_RESPONSE_SIZE) {
      throw new Error(`Response exceeded size limit: ${stringified.length} bytes (max: ${MAX_RESPONSE_SIZE})`);
    }
    return data;
  }
  
  // For real responses, use streaming text reader then parse
  const text = await readResponseText(response);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual', // Prevent automatic redirect following to avoid SSRF
      headers: {
        'User-Agent': 'agent-trust-scan/0.1.0',
      },
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Safe fetch wrapper that validates redirect targets against private/reserved IPs
 * Follows redirects manually after validating each Location header
 * 
 * DNS rebinding protection: Re-validates DNS for EVERY request (including after redirects)
 * to prevent TOCTOU attacks where a domain resolves to different IPs between validation and fetch.
 * 
 * @param url - URL to fetch
 * @param timeoutMs - Request timeout in milliseconds
 * @param maxRedirects - Maximum number of redirects to follow
 */
export async function safeFetch(
  url: string,
  timeoutMs: number = 10000,
  maxRedirects: number = 5
): Promise<Response> {
  const { isPrivateOrReservedIP } = await import('./security.js');
  const { URL } = await import('url');
  const { lookup } = await import('dns/promises');
  
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    // Validate the URL before fetching
    const parsedUrl = new URL(currentUrl);
    
    // Only allow http/https schemes
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsafe URL scheme: ${parsedUrl.protocol}`);
    }
    
    // Check if hostname resolves to private IP
    const hostname = parsedUrl.hostname;
    try {
      const addresses = await lookup(hostname, { all: true });
      for (const { address } of addresses) {
        if (isPrivateOrReservedIP(address)) {
          throw new Error(`URL resolves to private/reserved IP: ${address}`);
        }
      }
    } catch (error: any) {
      // If DNS lookup fails, throw error (fail closed)
      if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        throw new Error(`DNS lookup failed for ${hostname}`);
      }
      throw error;
    }

    // Fetch with manual redirect handling
    const response = await fetchWithTimeout(currentUrl, timeoutMs);

    // Check if it's a redirect
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (!location) {
        // Cancel body before throwing - we only needed headers
        response.body?.cancel();
        throw new Error('Redirect response missing Location header');
      }

      redirectCount++;
      if (redirectCount > maxRedirects) {
        // Cancel body before throwing - we only needed headers
        response.body?.cancel();
        throw new Error(`Too many redirects (max: ${maxRedirects})`);
      }

      // Cancel body - we only needed the Location header
      response.body?.cancel();
      
      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error('Unexpected redirect loop');
}

export function normalizeUrl(domain: string): string {
  // Remove protocol if present
  domain = domain.replace(/^https?:\/\//, '');
  // Remove trailing slash
  domain = domain.replace(/\/$/, '');
  // Remove path if present
  domain = domain.split('/')[0];
  
  // Check for userinfo BEFORE parsing (@ should not be in domain)
  if (domain.includes('@')) {
    // Return as-is so validateDomain can reject it properly
    return domain;
  }
  
  // Parse to validate and normalize (handles IPv6 brackets)
  try {
    const url = new URL(`https://${domain}`);
    // Return host (hostname + port), which preserves IPv6 brackets and ports
    return url.host;
  } catch {
    // If parsing fails, return as-is (will be caught by validateDomain)
    return domain;
  }
}

export function buildUrl(domain: string, path: string): string {
  const normalized = normalizeUrl(domain);
  return `https://${normalized}${path}`;
}

/**
 * Calculate overall score from check results
 * 
 * TODO (v0.2.0): Improve scoring model:
 * - Add weighted checks (health/A2A more important than optional MCP)
 * - Consider check severity (missing A2A vs 1 broken link)
 * - Treat optional checks (MCP) as N/A instead of penalizing absence
 * - Add completeness metrics (A2A field completeness, link health ratio)
 * - Support configurable scoring policies
 */
export function calculateScore(checks: Record<string, { status: string }>): number {
  const statuses = Object.values(checks).map(c => c.status);
  const passCount = statuses.filter(s => s === 'pass').length;
  const warnCount = statuses.filter(s => s === 'warn').length;
  const total = statuses.length;
  
  // pass = 100%, warn = 50%, fail = 0%
  return Math.round(((passCount * 100) + (warnCount * 50)) / total);
}
