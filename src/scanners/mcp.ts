import { MCPServerSchema } from '../types.js';
import { buildUrl, safeFetch } from '../utils.js';
import type { CheckResult } from '../types.js';

export async function scanMCP(domain: string): Promise<CheckResult> {
  // MCP servers typically expose metadata at /.well-known/mcp.json or /mcp.json
  const paths = ['/.well-known/mcp.json', '/mcp.json'];
  
  let lastSchemaError: CheckResult | null = null;
  
  for (const path of paths) {
    const url = buildUrl(domain, path);
    
    try {
      const response = await safeFetch(url);
      
      if (!response.ok) {
        continue; // Try next path
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        continue; // Try next path
      }

      const data = await response.json();
      
      // Validate schema
      const result = MCPServerSchema.safeParse(data);
      
      if (!result.success) {
        // Save schema error but try next path
        lastSchemaError = {
          status: 'warn',
          details: {
            mcpDetected: true,
            url,
            schemaValid: false,
            errors: result.error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
            message: 'MCP metadata found but schema validation failed',
          },
        };
        continue;
      }

      const server = result.data;
      const toolsCount = server.tools?.length || 0;

      return {
        status: 'pass',
        details: {
          mcpDetected: true,
          url,
          schemaValid: true,
          name: server.name,
          version: server.version,
          toolsCount,
          message: `MCP server detected with ${toolsCount} tool(s)`,
        },
      };
    } catch {
      // Continue to next path
      continue;
    }
  }

  // If we found MCP metadata with schema errors, return that
  if (lastSchemaError) {
    return lastSchemaError;
  }

  // No MCP endpoint found
  return {
    status: 'warn',
    details: {
      mcpDetected: false,
      message: 'No MCP server metadata found (checked /.well-known/mcp.json and /mcp.json)',
    },
  };
}
