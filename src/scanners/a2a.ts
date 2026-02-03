import { A2AAgentCardSchema } from '../types.js';
import { buildUrl, fetchWithTimeout } from '../utils.js';
import type { CheckResult } from '../types.js';

export async function scanA2AAgentCard(domain: string): Promise<CheckResult> {
  const url = buildUrl(domain, '/.well-known/agent.json');
  
  try {
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        return {
          status: 'warn',
          details: {
            exists: false,
            url,
            message: 'A2A Agent Card not found',
          },
        };
      }
      
      return {
        status: 'fail',
        details: {
          exists: false,
          url,
          statusCode: response.status,
          message: `HTTP ${response.status} ${response.statusText}`,
        },
      };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      // If we get HTML at this path, it's likely a SPA catch-all (not found)
      // Treat as warn (not found) rather than fail (broken)
      if (contentType?.includes('text/html')) {
        return {
          status: 'warn',
          details: {
            exists: false,
            url,
            message: 'A2A Agent Card not found (SPA catch-all returned HTML)',
          },
        };
      }
      
      // Other non-JSON content-types are actual failures
      return {
        status: 'fail',
        details: {
          exists: true,
          url,
          schemaValid: false,
          message: `Invalid content-type: ${contentType}`,
        },
      };
    }

    const data = await response.json();
    
    // Validate schema
    const result = A2AAgentCardSchema.safeParse(data);
    
    if (!result.success) {
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
      };
    }

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

    // Detect authentication requirements
    const authRequired = card.authentication?.schemes && card.authentication.schemes.length > 0;

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
    };
  } catch (error) {
    return {
      status: 'fail',
      details: {
        exists: false,
        url,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to fetch A2A Agent Card',
      },
    };
  }
}
