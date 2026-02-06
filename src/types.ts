import { z } from 'zod';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface TraceStep {
  step: string;        // What action was taken (e.g., "fetch", "schema_validate", "auth_check")
  observed: string;    // What was observed
  inference: string;   // What conclusion was drawn and why
}

export interface CheckResult {
  status: CheckStatus;
  details: Record<string, any>;
  trace?: TraceStep[];  // Decision reasoning chain (populated when --trace is used)
}

export interface ScanReport {
  domain: string;
  timestamp: string;
  score: number;
  checks: {
    a2a_agent_card: CheckResult;
    llms_txt: CheckResult;
    health: CheckResult;
    mcp: CheckResult;
  };
  summary: string;
  traceEnabled?: boolean;  // Whether trace data is included
}

// A2A Agent Card schema
export const A2AAgentCardSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  version: z.string(),
  protocol_version: z.string().optional(),
  description: z.string().optional(),
  provider: z.object({
    organization: z.string().optional(),
    url: z.string().url().optional(),
  }).optional(),
  capabilities: z.object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
  }).optional(),
  authentication: z.object({
    schemes: z.array(z.string()).optional(),
    credentials: z.string().optional(),
  }).optional(),
  skills: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
  })),
  defaultInputModes: z.array(z.string()).optional(),
  defaultOutputModes: z.array(z.string()).optional(),
});

export type A2AAgentCard = z.infer<typeof A2AAgentCardSchema>;

// MCP Server schema (basic)
export const MCPServerSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.record(z.any()).optional(),
  })).optional(),
});

export type MCPServer = z.infer<typeof MCPServerSchema>;
