export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
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
