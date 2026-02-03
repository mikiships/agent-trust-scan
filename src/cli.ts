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
  .action(async (domain: string | undefined, options: any) => {
    try {
      const format = options.json ? 'json' : options.format;
      
      if (!['table', 'json', 'markdown'].includes(format)) {
        console.error(`Invalid format: ${format}. Use table, json, or markdown.`);
        process.exit(1);
      }

      let domains: string[] = [];
      
      if (domain) {
        domains.push(domain);
      } else if (options.domains) {
        const content = await readFile(options.domains, 'utf-8');
        domains = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
      } else {
        console.error('Error: Must provide either a domain or --domains file');
        program.help();
        process.exit(1);
      }

      if (domains.length === 0) {
        console.error('Error: No domains to scan');
        process.exit(1);
      }

      // Scan all domains
      const reports: ScanReport[] = [];
      let hasFailures = false;

      for (const d of domains) {
        const report = await scanDomain(d);
        reports.push(report);
        
        // Check for failures
        const failures = Object.values(report.checks).filter(c => c.status === 'fail');
        if (failures.length > 0) {
          hasFailures = true;
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
