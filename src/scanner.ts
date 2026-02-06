import { scanA2AAgentCard } from './scanners/a2a.js';
import { scanLlmsTxt } from './scanners/llms-txt.js';
import { scanHealth } from './scanners/health.js';
import { scanMCP } from './scanners/mcp.js';
import { calculateScore, normalizeUrl } from './utils.js';
import { validateDomain } from './security.js';
import type { ScanReport, CheckResult } from './types.js';

export interface ScanOptions {
  trace?: boolean;
}

function stripTrace(result: CheckResult): CheckResult {
  const { trace, ...rest } = result;
  return rest;
}

export async function scanDomain(domain: string, options?: ScanOptions): Promise<ScanReport> {
  const normalized = normalizeUrl(domain);
  
  // Validate domain is not private/reserved IP
  const validation = await validateDomain(normalized);
  if (!validation.valid) {
    throw new Error(`Invalid domain: ${validation.reason}`);
  }
  
  // Run all scans in parallel
  const [a2aResult, llmsTxtResult, healthResult, mcpResult] = await Promise.all([
    scanA2AAgentCard(normalized),
    scanLlmsTxt(normalized),
    scanHealth(normalized),
    scanMCP(normalized),
  ]);

  const includeTrace = options?.trace === true;

  const checks = {
    a2a_agent_card: includeTrace ? a2aResult : stripTrace(a2aResult),
    llms_txt: includeTrace ? llmsTxtResult : stripTrace(llmsTxtResult),
    health: includeTrace ? healthResult : stripTrace(healthResult),
    mcp: includeTrace ? mcpResult : stripTrace(mcpResult),
  };

  const score = calculateScore(checks);
  
  // Generate summary
  const passCount = Object.values(checks).filter(c => c.status === 'pass').length;
  const warnCount = Object.values(checks).filter(c => c.status === 'warn').length;
  const failCount = Object.values(checks).filter(c => c.status === 'fail').length;
  
  const summaryParts: string[] = [];
  summaryParts.push(`${passCount}/${Object.keys(checks).length} checks passed`);
  
  if (warnCount > 0) {
    summaryParts.push(`${warnCount} warning(s)`);
  }
  
  if (failCount > 0) {
    summaryParts.push(`${failCount} failure(s)`);
  }
  
  const failedChecks = Object.entries(checks)
    .filter(([_, result]) => result.status === 'fail')
    .map(([name]) => name);
    
  if (failedChecks.length > 0) {
    summaryParts.push(`Failed: ${failedChecks.join(', ')}`);
  }

  return {
    domain: normalized,
    timestamp: new Date().toISOString(),
    score,
    checks,
    summary: summaryParts.join('. '),
    ...(includeTrace ? { traceEnabled: true } : {}),
  };
}
