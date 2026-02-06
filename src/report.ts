import chalk from 'chalk';
import type { ScanReport, CheckStatus, TraceStep } from './types.js';

function getStatusSymbol(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return chalk.green('✓');
    case 'warn':
      return chalk.yellow('⚠');
    case 'fail':
      return chalk.red('✗');
  }
}

function getStatusColor(status: CheckStatus): (text: string) => string {
  switch (status) {
    case 'pass':
      return chalk.green;
    case 'warn':
      return chalk.yellow;
    case 'fail':
      return chalk.red;
  }
}

function formatTraceForTable(trace: TraceStep[]): string[] {
  const lines: string[] = [];
  lines.push(`  ${chalk.bold('Reasoning:')}`);
  for (const step of trace) {
    // Use observed as the leading arrow line, and inference as the indented explanation
    lines.push(`    → ${chalk.gray(step.observed)}`);
    lines.push(`      ${chalk.gray(step.inference)}`);
  }
  return lines;
}

function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function formatReportJson(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatReportTable(report: ScanReport): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push(chalk.bold.cyan(`Scan Report: ${report.domain}`));
  lines.push(chalk.gray(`Timestamp: ${report.timestamp}`));
  lines.push(chalk.bold(`Score: ${report.score}/100`));
  lines.push('');
  
  const checkNames = {
    a2a_agent_card: 'A2A Agent Card',
    llms_txt: 'llms.txt',
    health: 'Health Check',
    mcp: 'MCP Server',
  };
  
  for (const [key, result] of Object.entries(report.checks)) {
    const name = checkNames[key as keyof typeof checkNames];
    const symbol = getStatusSymbol(result.status);
    const color = getStatusColor(result.status);
    
    lines.push(`${symbol} ${chalk.bold(name)}: ${color(result.status.toUpperCase())}`);
    
    // Show key details
    if (result.details.exists === false) {
      lines.push(`  ${chalk.gray('Not found')}`);
    } else if (result.details.message) {
      lines.push(`  ${chalk.gray(result.details.message)}`);
    }
    
    // Show additional details for specific checks
    if (key === 'a2a_agent_card' && result.details.schemaValid) {
      lines.push(`  ${chalk.gray(`Name: ${result.details.name}`)}`);
      lines.push(`  ${chalk.gray(`Version: ${result.details.version}`)}`);
      lines.push(`  ${chalk.gray(`Skills: ${result.details.skillsCount}`)}`);
      lines.push(`  ${chalk.gray(`Completeness: ${result.details.completeness}%`)}`);
    }
    
    if (key === 'llms_txt' && result.details.formatValid) {
      lines.push(`  ${chalk.gray(`Links: ${result.details.linkCount}`)}`);
      if (result.details.brokenLinks && result.details.brokenLinks.length > 0) {
        lines.push(`  ${chalk.yellow(`Broken links: ${result.details.brokenLinks.length}`)}`);
      }
    }
    
    if (key === 'health') {
      if (result.details.latencyMs !== undefined) {
        lines.push(`  ${chalk.gray(`Latency: ${result.details.latencyMs}ms`)}`);
      }
      if (result.details.tlsValid !== undefined) {
        lines.push(`  ${chalk.gray(`TLS: ${result.details.tlsValid ? 'Valid' : 'Invalid'}`)}`);
      }
      if (result.details.tlsExpiryDays !== undefined) {
        lines.push(`  ${chalk.gray(`Certificate expires in: ${result.details.tlsExpiryDays} days`)}`);
      }
    }
    
    if (key === 'mcp' && result.details.mcpDetected) {
      lines.push(`  ${chalk.gray(`Name: ${result.details.name}`)}`);
      lines.push(`  ${chalk.gray(`Tools: ${result.details.toolsCount}`)}`);
    }

    if (result.trace && result.trace.length > 0) {
      lines.push(...formatTraceForTable(result.trace));
    }
    
    lines.push('');
  }
  
  lines.push(chalk.bold('Summary:'));
  lines.push(`  ${report.summary}`);
  lines.push('');
  
  return lines.join('\n');
}

export function formatReportMarkdown(report: ScanReport): string {
  const lines: string[] = [];
  
  lines.push(`# Agent Trust Scan Report`);
  lines.push('');
  lines.push(`**Domain:** ${report.domain}`);
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push(`**Score:** ${report.score}/100`);
  if (report.traceEnabled) {
    lines.push(`**Trace Enabled:** true`);
  }
  lines.push('');
  lines.push(`## Checks`);
  lines.push('');
  
  const checkNames = {
    a2a_agent_card: 'A2A Agent Card',
    llms_txt: 'llms.txt',
    health: 'Health Check',
    mcp: 'MCP Server',
  };
  
  for (const [key, result] of Object.entries(report.checks)) {
    const name = checkNames[key as keyof typeof checkNames];
    const emoji = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    
    lines.push(`### ${emoji} ${name} - ${result.status.toUpperCase()}`);
    lines.push('');
    
    if (result.details.message) {
      lines.push(result.details.message);
      lines.push('');
    }

    if (result.trace && result.trace.length > 0) {
      lines.push('#### Decision Trace');
      lines.push('');
      lines.push('| Step | Observed | Inference |');
      lines.push('|------|----------|-----------|');
      for (const step of result.trace) {
        lines.push(`| ${escapeMarkdownCell(step.step)} | ${escapeMarkdownCell(step.observed)} | ${escapeMarkdownCell(step.inference)} |`);
      }
      lines.push('');
    }
    
    // Show details as list
    const relevantDetails = { ...result.details };
    delete relevantDetails.message;
    
    if (Object.keys(relevantDetails).length > 0) {
      lines.push('<details>');
      lines.push('<summary>Details</summary>');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(relevantDetails, null, 2));
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }
  
  lines.push(`## Summary`);
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  
  return lines.join('\n');
}
