import { MCPServerSchema } from '../types.js';
import { buildUrl, safeFetch, readResponseJson } from '../utils.js';
import type { CheckResult, TraceStep } from '../types.js';

export async function scanMCP(domain: string): Promise<CheckResult> {
  // MCP servers typically expose metadata at /.well-known/mcp.json or /mcp.json
  const paths = ['/.well-known/mcp.json', '/mcp.json'];
  const trace: TraceStep[] = [];
  
  let lastSchemaError: CheckResult | null = null;
  const fetchObservations: string[] = [];
  
  for (const path of paths) {
    const url = buildUrl(domain, path);
    
    try {
      const response = await safeFetch(url);
      
      if (!response.ok) {
        // Cancel body before continuing to next path
        response.body?.cancel();
        fetchObservations.push(`GET ${path} -> ${response.status}`);
        continue; // Try next path
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        // Cancel body before continuing to next path
        response.body?.cancel();
        fetchObservations.push(`GET ${path} -> 200 OK, content-type: ${contentType} (not JSON, skipped)`);
        continue; // Try next path
      }

      fetchObservations.push(`GET ${path} -> 200 OK, ${contentType}`);
      trace.push({
        step: 'fetch',
        observed: fetchObservations.join(', '),
        inference: path === paths[0]
          ? 'MCP metadata found at standard well-known path'
          : 'MCP metadata found at non-standard path /mcp.json',
      });

      const data = await readResponseJson(response);
      
      // Validate schema
      const result = MCPServerSchema.safeParse(data);
      
      if (!result.success) {
        const errorSummary = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        trace.push({
          step: 'schema_validate',
          observed: `Zod parse failed: ${errorSummary}`,
          inference: 'MCP metadata exists but does not conform to expected schema — may be a different format or version',
        });
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
          trace: [...trace],
        };
        // Reset trace for next path attempt (but keep fetch observations)
        // Actually, if we continue to next path and it succeeds, we'll build fresh trace
        // If nothing else succeeds, lastSchemaError has the trace
        continue;
      }

      const server = result.data;
      const toolsCount = server.tools?.length || 0;

      trace.push({
        step: 'schema_validate',
        observed: `Name: "${server.name}"${server.version ? `, version: ${server.version}` : ''}, ${toolsCount} tool(s) declared`,
        inference: 'Valid MCP server metadata with declared capabilities',
      });

      trace.push({
        step: 'verdict',
        observed: `Schema valid, ${toolsCount} tool(s) available`,
        inference: toolsCount > 0
          ? `Functional MCP server with ${toolsCount} declared tool(s) — ready for tool discovery`
          : 'Valid MCP server metadata but no tools declared — server may be in setup phase',
      });

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
        trace,
      };
    } catch {
      fetchObservations.push(`GET ${path} -> Error (network/parse failure)`);
      // Continue to next path
      continue;
    }
  }

  // If we found MCP metadata with schema errors, return that (with its trace)
  if (lastSchemaError) {
    const schemaTrace = lastSchemaError.trace || trace;
    schemaTrace.push({
      step: 'verdict',
      observed: 'Schema validation failed on all paths tried',
      inference: 'MCP metadata exists but is malformed — server should update to conform to MCP specification',
    });
    lastSchemaError.trace = schemaTrace;
    return lastSchemaError;
  }

  // No MCP endpoint found
  trace.push({
    step: 'fetch',
    observed: fetchObservations.length > 0 ? fetchObservations.join(', ') : `Checked ${paths.join(' and ')} — none returned valid JSON`,
    inference: 'No MCP server metadata found at any standard location',
  });
  trace.push({
    step: 'verdict',
    observed: `Checked ${paths.length} path(s), no MCP metadata found`,
    inference: 'MCP absence is not critical but means the endpoint doesn\'t expose tool metadata for automated discovery',
  });

  return {
    status: 'warn',
    details: {
      mcpDetected: false,
      message: 'No MCP server metadata found (checked /.well-known/mcp.json and /mcp.json)',
    },
    trace,
  };
}
