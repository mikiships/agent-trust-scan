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
        throw new Error('Redirect response missing Location header');
      }

      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (max: ${maxRedirects})`);
      }

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
  return domain;
}

export function buildUrl(domain: string, path: string): string {
  const normalized = normalizeUrl(domain);
  return `https://${normalized}${path}`;
}

export function calculateScore(checks: Record<string, { status: string }>): number {
  const statuses = Object.values(checks).map(c => c.status);
  const passCount = statuses.filter(s => s === 'pass').length;
  const warnCount = statuses.filter(s => s === 'warn').length;
  const total = statuses.length;
  
  // pass = 100%, warn = 50%, fail = 0%
  return Math.round(((passCount * 100) + (warnCount * 50)) / total);
}
