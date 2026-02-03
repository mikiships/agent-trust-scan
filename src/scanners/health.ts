import { buildUrl, safeFetch } from '../utils.js';
import type { CheckResult } from '../types.js';
import * as tls from 'tls';
import { URL } from 'url';

interface TLSInfo {
  valid: boolean;
  expiryDays?: number;
  issuer?: string;
  error?: string;
}

async function checkTLS(domain: string, port: number = 443): Promise<TLSInfo> {
  // For TLS check, use the hostname without port for servername
  const hostname = domain.split(':')[0];
  
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
  
  try {
    // Measure latency
    const startTime = Date.now();
    const response = await safeFetch(url);
    const latencyMs = Date.now() - startTime;
    
    // Check TLS
    const tlsInfo = await checkTLS(hostname, port);
    
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
    };
  } catch (error) {
    return {
      status: 'fail',
      details: {
        url,
        error: error instanceof Error ? error.message : String(error),
        message: 'Health check failed',
      },
    };
  }
}
