import { buildUrl, safeFetch } from '../utils.js';
import type { CheckResult, TraceStep } from '../types.js';
import * as tls from 'tls';
import { URL } from 'url';
import { lookup } from 'dns/promises';
import { isPrivateOrReservedIP } from '../security.js';

interface TLSInfo {
  valid: boolean;
  expiryDays?: number;
  issuer?: string;
  error?: string;
}

async function checkTLS(domain: string, port: number = 443): Promise<TLSInfo> {
  // Strip brackets from IPv6 literals if present (e.g., [2001:db8::1] -> 2001:db8::1)
  const hostname = domain.replace(/^\[|\]$/g, '');
  
  // Validate DNS before connecting (same protection as safeFetch)
  try {
    const addresses = await lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateOrReservedIP(address)) {
        return {
          valid: false,
          error: `TLS target resolves to private/reserved IP: ${address}`,
        };
      }
    }
  } catch (error: any) {
    // DNS lookup failure
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      return {
        valid: false,
        error: `DNS lookup failed for ${hostname}`,
      };
    }
    return {
      valid: false,
      error: error.message || 'DNS validation error',
    };
  }
  
  return new Promise((resolve) => {
    const options = {
      host: hostname,
      port: port,
      servername: hostname,
      rejectUnauthorized: false, // We want to check even if invalid
    };

    const socket = tls.connect(options, () => {
      const cert = socket.getPeerCertificate();
      
      if (!cert || Object.keys(cert).length === 0) {
        socket.destroy();
        resolve({
          valid: false,
          error: 'No certificate found',
        });
        return;
      }

      const now = new Date();
      const validTo = new Date(cert.valid_to);
      const validFrom = new Date(cert.valid_from);
      
      const isValid = now >= validFrom && now <= validTo;
      const expiryDays = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      socket.destroy();
      resolve({
        valid: isValid,
        expiryDays,
        issuer: cert.issuer?.O || 'Unknown',
      });
    });

    socket.on('error', (err) => {
      resolve({
        valid: false,
        error: err.message,
      });
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve({
        valid: false,
        error: 'Connection timeout',
      });
    });
  });
}

export async function scanHealth(domain: string): Promise<CheckResult> {
  const url = buildUrl(domain, '/');
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname;
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 443;
  const trace: TraceStep[] = [];
  
  try {
    // Measure latency
    const startTime = Date.now();
    const response = await safeFetch(url);
    const latencyMs = Date.now() - startTime;
    
    // Cancel response body - we only need status code
    response.body?.cancel();
    
    trace.push({
      step: 'fetch',
      observed: `GET ${parsedUrl.pathname} -> ${response.status} ${response.ok ? 'OK' : response.statusText} in ${latencyMs}ms`,
      inference: response.ok
        ? `Server is responsive${latencyMs <= 1000 ? ' with acceptable latency' : ` but latency is ${latencyMs > 3000 ? 'high' : 'elevated'}`}`
        : `Server responded with an error status`,
    });
    
    // Check TLS
    const tlsInfo = await checkTLS(hostname, port);
    
    if (tlsInfo.valid) {
      const expiryNote = tlsInfo.expiryDays !== undefined
        ? `, expires in ${tlsInfo.expiryDays} days`
        : '';
      const issuerNote = tlsInfo.issuer ? `, issuer: ${tlsInfo.issuer}` : '';
      trace.push({
        step: 'tls_check',
        observed: `Valid certificate${expiryNote}${issuerNote}`,
        inference: tlsInfo.expiryDays !== undefined && tlsInfo.expiryDays < 30
          ? `TLS certificate is valid but expiring soon (${tlsInfo.expiryDays} days) — renewal needed`
          : 'TLS properly configured with sufficient validity period',
      });
    } else {
      trace.push({
        step: 'tls_check',
        observed: `TLS check failed: ${tlsInfo.error || 'Certificate validation failed'}`,
        inference: 'Invalid or missing TLS certificate compromises transport security — data in transit is not protected',
      });
    }
    
    // Determine status
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    const warnings: string[] = [];
    
    if (!response.ok) {
      status = 'warn';
      warnings.push(`HTTP ${response.status} ${response.statusText}`);
    }
    
    if (!tlsInfo.valid) {
      status = 'fail';
      warnings.push(`TLS invalid: ${tlsInfo.error || 'Certificate validation failed'}`);
    } else if (tlsInfo.expiryDays !== undefined && tlsInfo.expiryDays < 30) {
      status = 'warn';
      warnings.push(`TLS certificate expires in ${tlsInfo.expiryDays} days`);
    }
    
    if (latencyMs > 3000) {
      if (status === 'pass') status = 'warn';
      warnings.push(`High latency: ${latencyMs}ms`);
    }
    
    // Build verdict
    const verdictObserved: string[] = [];
    verdictObserved.push(`HTTP ${response.status}`);
    verdictObserved.push(`TLS ${tlsInfo.valid ? 'valid' : 'invalid'}`);
    verdictObserved.push(`latency ${latencyMs}ms`);

    if (status === 'pass') {
      trace.push({
        step: 'verdict',
        observed: verdictObserved.join(', '),
        inference: 'All health indicators normal — server is operational and secure',
      });
    } else if (status === 'warn') {
      trace.push({
        step: 'verdict',
        observed: verdictObserved.join(', '),
        inference: `Health check passed with warnings: ${warnings.join('; ')}`,
      });
    } else {
      trace.push({
        step: 'verdict',
        observed: verdictObserved.join(', '),
        inference: `Critical health issue detected: ${warnings.join('; ')}`,
      });
    }

    return {
      status,
      details: {
        url,
        statusCode: response.status,
        latencyMs,
        tlsValid: tlsInfo.valid,
        tlsExpiryDays: tlsInfo.expiryDays,
        tlsIssuer: tlsInfo.issuer,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: warnings.length > 0 ? warnings.join('; ') : 'All health checks passed',
      },
      trace,
    };
  } catch (error) {
    trace.push({
      step: 'fetch',
      observed: `GET ${parsedUrl.pathname} -> Error: ${error instanceof Error ? error.message : String(error)}`,
      inference: 'Unable to reach the server — endpoint may be down or unreachable',
    });
    trace.push({
      step: 'verdict',
      observed: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      inference: 'Server is unreachable, which is a critical health failure — no further checks possible',
    });
    return {
      status: 'fail',
      details: {
        url,
        error: error instanceof Error ? error.message : String(error),
        message: 'Health check failed',
      },
      trace,
    };
  }
}
