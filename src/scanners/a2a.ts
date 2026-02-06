import { A2AAgentCardSchema } from '../types.js';
import { buildUrl, safeFetch, readResponseJson } from '../utils.js';
import type { CheckResult, TraceStep } from '../types.js';

export async function scanA2AAgentCard(domain: string): Promise<CheckResult> {
  const url = buildUrl(domain, '/.well-known/agent.json');
  const trace: TraceStep[] = [];
  
  try {
    const response = await safeFetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        // Cancel body to avoid leaving connection open
        response.body?.cancel();
        trace.push({
          step: 'fetch',
          observed: `GET /.well-known/agent.json -> ${response.status} Not Found`,
          inference: 'No A2A agent card deployed at standard location',
        });
        trace.push({
          step: 'verdict',
          observed: 'Endpoint not found',
          inference: 'Agent card absence is not a critical failure but indicates the endpoint hasn\'t adopted A2A protocol yet',
        });
        return {
          status: 'warn',
          details: {
            exists: false,
            url,
            message: 'A2A Agent Card not found',
          },
          trace,
        };
      }
      
      // Cancel body to avoid leaving connection open
      response.body?.cancel();
      trace.push({
        step: 'fetch',
        observed: `GET /.well-known/agent.json -> ${response.status} ${response.statusText}`,
        inference: `Server returned an error response, indicating a problem with the agent card endpoint`,
      });
      trace.push({
        step: 'verdict',
        observed: `HTTP ${response.status} error`,
        inference: `Non-404 error suggests the endpoint exists but is misconfigured or experiencing issues`,
      });
      return {
        status: 'fail',
        details: {
          exists: false,
          url,
          statusCode: response.status,
          message: `HTTP ${response.status} ${response.statusText}`,
        },
        trace,
      };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      // If we get HTML at this path, it's likely a SPA catch-all (not found)
      // Treat as warn (not found) rather than fail (broken)
      if (contentType?.includes('text/html')) {
        // Cancel body to avoid leaving connection open
        response.body?.cancel();
        trace.push({
          step: 'fetch',
          observed: `GET /.well-known/agent.json -> 200 OK, content-type: ${contentType}`,
          inference: 'Received HTML instead of JSON — likely a SPA catch-all route, not a real agent card',
        });
        trace.push({
          step: 'verdict',
          observed: 'HTML response at agent card path',
          inference: 'SPA frameworks often return 200 for all routes; treating as not found rather than broken',
        });
        return {
          status: 'warn',
          details: {
            exists: false,
            url,
            message: 'A2A Agent Card not found (SPA catch-all returned HTML)',
          },
          trace,
        };
      }
      
      // Other non-JSON content-types are actual failures
      // Cancel body to avoid leaving connection open
      response.body?.cancel();
      trace.push({
        step: 'fetch',
        observed: `GET /.well-known/agent.json -> 200 OK, content-type: ${contentType}`,
        inference: `Endpoint exists but serves wrong content type — expected application/json`,
      });
      trace.push({
        step: 'verdict',
        observed: `Invalid content-type: ${contentType}`,
        inference: 'Endpoint is misconfigured; it should serve application/json for the agent card',
      });
      return {
        status: 'fail',
        details: {
          exists: true,
          url,
          schemaValid: false,
          message: `Invalid content-type: ${contentType}`,
        },
        trace,
      };
    }

    trace.push({
      step: 'fetch',
      observed: `GET /.well-known/agent.json -> 200 OK, content-type: ${contentType}`,
      inference: 'Agent card endpoint exists and serves JSON',
    });

    const data = await readResponseJson(response);
    
    // Validate schema
    const result = A2AAgentCardSchema.safeParse(data);
    
    if (!result.success) {
      const errorSummary = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      trace.push({
        step: 'schema_validate',
        observed: `Zod parse failed: ${errorSummary}`,
        inference: 'Card does not conform to A2A Agent Card specification — missing or invalid required fields',
      });
      trace.push({
        step: 'verdict',
        observed: `${result.error.errors.length} schema validation error(s)`,
        inference: 'Invalid schema means other agents cannot reliably parse this card, making it untrustworthy for interoperability',
      });
      return {
        status: 'fail',
        details: {
          exists: true,
          url,
          schemaValid: false,
          errors: result.error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
          message: 'Schema validation failed',
        },
        trace,
      };
    }

    trace.push({
      step: 'schema_validate',
      observed: 'Zod parse succeeded, all required fields present',
      inference: 'Card conforms to A2A Agent Card specification',
    });

    // Calculate field completeness (optional fields)
    const card = result.data;
    const optionalFields = [
      'protocol_version',
      'description',
      'provider',
      'capabilities',
      'authentication',
      'defaultInputModes',
      'defaultOutputModes',
    ];
    
    const presentOptional = optionalFields.filter(field => {
      const value = card[field as keyof typeof card];
      return value !== undefined && value !== null;
    });
    
    const completeness = Math.round((presentOptional.length / optionalFields.length) * 100);

    trace.push({
      step: 'completeness',
      observed: `${presentOptional.length}/${optionalFields.length} optional fields populated (${completeness}%)`,
      inference: completeness >= 70
        ? 'Well-maintained card with good metadata coverage'
        : completeness >= 40
          ? 'Moderate metadata coverage — some optional fields could improve discoverability'
          : 'Minimal metadata — card has required fields but lacks optional context for consumers',
    });

    // Detect authentication requirements
    const authRequired = card.authentication?.schemes && card.authentication.schemes.length > 0;

    if (authRequired) {
      trace.push({
        step: 'auth_check',
        observed: `authentication.schemes: ${JSON.stringify(card.authentication!.schemes)}`,
        inference: 'Endpoint requires authentication, reducing unauthorized access risk',
      });
    } else {
      trace.push({
        step: 'auth_check',
        observed: 'No authentication schemes declared',
        inference: 'Endpoint does not advertise authentication requirements — may be publicly accessible',
      });
    }

    // Build verdict
    const verdictParts: string[] = [];
    if (authRequired) verdictParts.push('auth required');
    verdictParts.push(`${completeness}% completeness`);
    verdictParts.push(`${card.skills.length} skill(s)`);

    trace.push({
      step: 'verdict',
      observed: `All validations passed, ${card.skills.length} skill(s) declared`,
      inference: `Valid schema + ${verdictParts.join(' + ')} indicates a ${completeness >= 70 ? 'trustworthy, well-maintained' : 'functional'} endpoint`,
    });

    return {
      status: 'pass',
      details: {
        exists: true,
        url,
        schemaValid: true,
        name: card.name,
        version: card.version,
        skillsCount: card.skills.length,
        completeness,
        authRequired,
        authSchemes: card.authentication?.schemes || [],
      },
      trace,
    };
  } catch (error) {
    trace.push({
      step: 'fetch',
      observed: `GET /.well-known/agent.json -> Error: ${error instanceof Error ? error.message : String(error)}`,
      inference: 'Unable to reach the agent card endpoint',
    });
    trace.push({
      step: 'verdict',
      observed: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      inference: 'Cannot assess trust without reaching the endpoint — network issue or server is down',
    });
    return {
      status: 'fail',
      details: {
        exists: false,
        url,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to fetch A2A Agent Card',
      },
      trace,
    };
  }
}
