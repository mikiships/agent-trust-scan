#!/usr/bin/env node

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { scanDomain } from './scanner.js';
import { formatReportJson, formatReportTable, formatReportMarkdown } from './report.js';
import type { ScanReport } from './types.js';

const program = new Command();

program
  .name('agent-trust-scan')
  .description('Validate agent/tool endpoints across A2A, MCP, and llms.txt protocols')
  .version('0.1.0');

program
  .argument('[domain]', 'Domain to scan (e.g., example.com)')
  .option('-d, --domains <file>', 'File containing list of domains (one per line)')
  .option('-f, --format <format>', 'Output format: table|json|markdown', 'table')
  .option('-j, --json', 'Output JSON format (shorthand for --format json)')
  .option('-t, --trace', 'Include decision trace (reasoning chain) in output')
  .option('-v, --verbose', 'Show detailed progress and URLs being fetched')
  .option('-t, --trace', 'Include decision trace (reasoning chain) in output')
  .action(async (domain: string | undefined, options: any) => {
    try {
      const format = options.json ? 'json' : options.format;
      
      if (!['table', 'json', 'markdown'].includes(format)) {
        console.error(`Invalid format: ${format}. Use table, json, or markdown.`);
        process.exit(1);
      }

      let domains: string[] = [];
      
      if (domain) {
        domains.push(domain.trim());
      } else if (options.domains) {
        const content = await readFile(options.domains, 'utf-8');
        domains = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
      } else {
        console.error('Error: Must provide either a domain or --domains file');
        console.error('Run "agent-trust-scan --help" for usage information');
        process.exit(1);
      }

      if (domains.length === 0) {
        console.error('Error: No domains to scan');
        process.exit(1);
      }

      // Scan all domains in parallel with concurrency limit
      const CONCURRENCY = 5;
      const reports: ScanReport[] = [];
      let hasFailures = false;

      // Process domains in batches
      for (let i = 0; i < domains.length; i += CONCURRENCY) {
        const batch = domains.slice(i, i + CONCURRENCY);
        
        if (options.verbose) {
          console.error(`Scanning batch: ${batch.join(', ')}`);
        }
        
        const batchResults = await Promise.all(
          batch.map(async (d) => {
            try {
              if (options.verbose) {
                console.error(`Starting scan: ${d}`);
              }
              const report = await scanDomain(d, { trace: options.trace });
              if (options.verbose) {
                console.error(`Completed scan: ${d} (score: ${report.score})`);
              }
              return report;
            } catch (error) {
              if (options.verbose) {
                console.error(`Failed scan: ${d} - ${error instanceof Error ? error.message : String(error)}`);
              }
              // Return a failed report instead of throwing
              return {
                domain: d,
                timestamp: new Date().toISOString(),
                score: 0,
                summary: 'Scan failed',
                ...(options.trace ? { traceEnabled: true } : {}),
                checks: {
                  a2a_agent_card: {
                    status: 'fail' as const,
                    details: {
                      error: error instanceof Error ? error.message : String(error),
                      message: 'Scan failed',
                    },
                  },
                  llms_txt: {
                    status: 'fail' as const,
                    details: {
                      error: 'Scan failed',
                      message: 'Scan failed',
                    },
                  },
                  health: {
                    status: 'fail' as const,
                    details: {
                      error: 'Scan failed',
                      message: 'Scan failed',
                    },
                  },
                  mcp: {
                    status: 'fail' as const,
                    details: {
                      error: 'Scan failed',
                      message: 'Scan failed',
                    },
                  },
                },
              } as ScanReport;
            }
          })
        );
        
        reports.push(...batchResults);
        
        // Check for failures
        for (const report of batchResults) {
          const failures = Object.values(report.checks).filter(c => c.status === 'fail');
          if (failures.length > 0) {
            hasFailures = true;
          }
        }
      }

      // Output results
      if (format === 'json') {
        if (reports.length === 1) {
          console.log(formatReportJson(reports[0]));
        } else {
          console.log(JSON.stringify(reports, null, 2));
        }
      } else if (format === 'markdown') {
        for (const report of reports) {
          console.log(formatReportMarkdown(report));
          if (reports.length > 1) {
            console.log('---\n');
          }
        }
      } else {
        // table format
        for (const report of reports) {
          console.log(formatReportTable(report));
        }
      }

      // Exit with appropriate code
      process.exit(hasFailures ? 1 : 0);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
