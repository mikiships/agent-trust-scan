import { scanA2AAgentCard } from './scanners/a2a.js';
import { scanLlmsTxt } from './scanners/llms-txt.js';
import { scanHealth } from './scanners/health.js';
import { scanMCP } from './scanners/mcp.js';
import { calculateScore, normalizeUrl } from './utils.js';
import type { ScanReport } from './types.js';

export async function scanDomain(domain: string): Promise<ScanReport> {
  const normalized = normalizeUrl(domain);
  
  // Run all scans in parallel
  const [a2aResult, llmsTxtResult, healthResult, mcpResult] = await Promise.all([
    scanA2AAgentCard(normalized),
    scanLlmsTxt(normalized),
    scanHealth(normalized),
    scanMCP(normalized),
  ]);

  const checks = {
    a2a_agent_card: a2aResult,
    llms_txt: llmsTxtResult,
    health: healthResult,
    mcp: mcpResult,
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
  };
}
