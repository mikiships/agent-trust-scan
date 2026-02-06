import { describe, it, expect } from '@jest/globals';
import { formatReportJson, formatReportTable, formatReportMarkdown } from '../report.js';
import type { ScanReport } from '../types.js';

describe('Report Formatters', () => {
  const mockReport: ScanReport = {
    domain: 'example.com',
    timestamp: '2024-01-01T00:00:00.000Z',
    score: 75,
    summary: '3/4 checks passed. 1 warning(s)',
    checks: {
      a2a_agent_card: {
        status: 'pass',
        details: {
          exists: true,
          url: 'https://example.com/.well-known/agent.json',
          schemaValid: true,
          name: 'Example Agent',
          version: '1.0.0',
          skillsCount: 5,
          completeness: 80,
          authRequired: true,
        },
        trace: [
          {
            step: 'fetch',
            observed: 'GET /.well-known/agent.json -> 200 OK, application/json',
            inference: 'Agent card endpoint exists and serves JSON',
          },
          {
            step: 'verdict',
            observed: 'All validations passed',
            inference: 'Valid schema indicates a trustworthy endpoint',
          },
        ],
      },
      llms_txt: {
        status: 'pass',
        details: {
          exists: true,
          url: 'https://example.com/llms.txt',
          formatValid: true,
          linkCount: 3,
          linksChecked: 3,
          brokenLinks: [],
          message: 'All links reachable',
        },
      },
      health: {
        status: 'pass',
        details: {
          url: 'https://example.com/',
          statusCode: 200,
          latencyMs: 150,
          tlsValid: true,
          tlsExpiryDays: 365,
          message: 'All health checks passed',
        },
      },
      mcp: {
        status: 'warn',
        details: {
          mcpDetected: false,
          message: 'No MCP server metadata found',
        },
      },
    },
  };

  describe('formatReportJson', () => {
    it('should return valid JSON string', () => {
      const result = formatReportJson(mockReport);
      const parsed = JSON.parse(result);

      expect(parsed.domain).toBe('example.com');
      expect(parsed.score).toBe(75);
      expect(parsed.checks).toBeDefined();
    });

    it('should include all check results', () => {
      const result = formatReportJson(mockReport);
      const parsed = JSON.parse(result);

      expect(Object.keys(parsed.checks)).toHaveLength(4);
      expect(parsed.checks.a2a_agent_card).toBeDefined();
      expect(parsed.checks.llms_txt).toBeDefined();
      expect(parsed.checks.health).toBeDefined();
      expect(parsed.checks.mcp).toBeDefined();
    });

    it('should handle empty details', () => {
      const minimalReport: ScanReport = {
        ...mockReport,
        checks: {
          a2a_agent_card: {
            status: 'pass',
            details: {},
          },
          llms_txt: {
            status: 'pass',
            details: {},
          },
          health: {
            status: 'pass',
            details: {},
          },
          mcp: {
            status: 'pass',
            details: {},
          },
        },
      };

      const result = formatReportJson(minimalReport);
      const parsed = JSON.parse(result);

      expect(parsed.checks.a2a_agent_card.details).toEqual({});
    });
  });

  describe('formatReportTable', () => {
    it('should return formatted table string', () => {
      const result = formatReportTable(mockReport);

      expect(result).toContain('example.com');
      expect(result).toContain('Score: 75/100');
      expect(result).toContain('✓');
      expect(result).toContain('⚠');
      expect(result).toContain('Reasoning:');
      expect(result).toContain('→');
    });

    it('should include all check names', () => {
      const result = formatReportTable(mockReport);

      expect(result).toContain('A2A Agent Card');
      expect(result).toContain('llms.txt');
      expect(result).toContain('Health');
      expect(result).toContain('MCP');
    });

    it('should show pass/warn/fail with proper symbols', () => {
      const reportWithFailure: ScanReport = {
        ...mockReport,
        checks: {
          ...mockReport.checks,
          a2a_agent_card: {
            status: 'fail',
            details: {
              exists: false,
              message: 'Not found',
            },
          },
        },
      };

      const result = formatReportTable(reportWithFailure);

      expect(result).toContain('✗');
    });

    it('should handle long values gracefully', () => {
      const reportWithLongMessage: ScanReport = {
        ...mockReport,
        checks: {
          ...mockReport.checks,
          a2a_agent_card: {
            status: 'pass',
            details: {
              message: 'A'.repeat(200),
            },
          },
        },
      };

      const result = formatReportTable(reportWithLongMessage);
      expect(result).toBeTruthy();
    });

    it('should include decision trace when present', () => {
      const reportWithTrace: ScanReport = {
        ...mockReport,
        traceEnabled: true,
        checks: {
          ...mockReport.checks,
          a2a_agent_card: {
            ...mockReport.checks.a2a_agent_card,
            trace: [
              {
                step: 'fetch',
                observed: 'GET /.well-known/agent.json -> 200 OK',
                inference: 'Agent card endpoint exists',
              },
              {
                step: 'verdict',
                observed: 'All validations passed',
                inference: 'Trustworthy endpoint',
              },
            ],
          },
        },
      };

      const result = formatReportTable(reportWithTrace);
      expect(result).toContain('Reasoning:');
      expect(result).toContain('GET /.well-known/agent.json -> 200 OK');
      expect(result).toContain('Trustworthy endpoint');
    });
  });

  describe('formatReportMarkdown', () => {
    it('should return markdown formatted string', () => {
      const result = formatReportMarkdown(mockReport);

      expect(result).toContain('# Agent Trust Scan Report');
      expect(result).toContain('**Domain:** example.com');
      expect(result).toContain('**Score:** 75/100');
      expect(result).toContain('#### Decision Trace');
      expect(result).toContain('| Step | Observed | Inference |');
    });

    it('should include collapsible details sections', () => {
      const result = formatReportMarkdown(mockReport);

      expect(result).toContain('<details>');
      expect(result).toContain('</details>');
      expect(result).toContain('<summary>');
    });

    it('should format check statuses with emojis', () => {
      const result = formatReportMarkdown(mockReport);

      expect(result).toContain('✅');
      expect(result).toContain('⚠️');
    });

    it('should handle failed checks', () => {
      const reportWithFailure: ScanReport = {
        ...mockReport,
        checks: {
          a2a_agent_card: {
            status: 'fail',
            details: {
              message: 'Something went wrong',
            },
          },
          llms_txt: mockReport.checks.llms_txt,
          health: mockReport.checks.health,
          mcp: mockReport.checks.mcp,
        },
      };

      const result = formatReportMarkdown(reportWithFailure);

      expect(result).toContain('❌');
      expect(result).toContain('Something went wrong');
    });

    it('should include decision trace section when present', () => {
      const reportWithTrace: ScanReport = {
        ...mockReport,
        traceEnabled: true,
        checks: {
          ...mockReport.checks,
          llms_txt: {
            ...mockReport.checks.llms_txt,
            trace: [
              { step: 'fetch', observed: 'GET /llms.txt -> 200 OK', inference: 'llms.txt file exists' },
            ],
          },
        },
      };

      const result = formatReportMarkdown(reportWithTrace);
      expect(result).toContain('#### Decision Trace');
      expect(result).toContain('| Step | Observed | Inference |');
      expect(result).toContain('GET /llms.txt -> 200 OK');
    });

    it('should not include message field in details block', () => {
      const result = formatReportMarkdown(mockReport);

      // message should appear in main status line, not duplicated in details
      const detailsSections = result.split('<details>');
      detailsSections.forEach((section) => {
        if (section.includes('```json')) {
          const jsonMatch = section.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            const json = JSON.parse(jsonMatch[1]);
            expect(json.message).toBeUndefined();
          }
        }
      });
    });
  });
});
