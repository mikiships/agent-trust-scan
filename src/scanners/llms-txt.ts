import { buildUrl, safeFetch, readResponseText } from '../utils.js';
import type { CheckResult, TraceStep } from '../types.js';
import { URL } from 'url';

interface LinkCheck {
  url: string;
  reachable: boolean;
  statusCode?: number;
  error?: string;
}

async function checkLink(url: string, baseUrl: string): Promise<LinkCheck> {
  try {
    // Resolve relative URLs
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(url, baseUrl).toString();
    } catch {
      return {
        url,
        reachable: false,
        error: 'Invalid URL format',
      };
    }

    // Parse and validate the URL
    const parsedUrl = new URL(absoluteUrl);

    // Only allow http/https schemes
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        url: absoluteUrl,
        reachable: false,
        error: `Unsupported URL scheme: ${parsedUrl.protocol}`,
      };
    }

    // Use safeFetch to prevent SSRF
    const response = await safeFetch(absoluteUrl, 5000);
    
    // Cancel body - we only need status code, not content
    response.body?.cancel();
    
    return {
      url: absoluteUrl,
      reachable: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseLlmsTxt(content: string): { valid: boolean; links: string[]; errors: string[] } {
  const lines = content.split('\n');
  const errors: string[] = [];
  const links: string[] = [];
  
  // First non-empty line should be the title (starting with #)
  let foundTitle = false;
  let inBlockquote = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) continue;
    
    if (!foundTitle) {
      if (!line.startsWith('#')) {
        errors.push('First line must be a title (starting with #)');
      }
      foundTitle = true;
      continue;
    }
    
    // Check for blockquote (optional)
    if (line.startsWith('>')) {
      inBlockquote = true;
      continue;
    }
    
    if (inBlockquote && !line.startsWith('>')) {
      inBlockquote = false;
    }
    
    // Extract links in markdown format [text](url)
    const linkMatches = line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const match of linkMatches) {
      links.push(match[2]);
    }
  }
  
  if (!foundTitle) {
    errors.push('Missing title line');
  }
  
  return {
    valid: errors.length === 0,
    links,
    errors,
  };
}

export async function scanLlmsTxt(domain: string): Promise<CheckResult> {
  const url = buildUrl(domain, '/llms.txt');
  const trace: TraceStep[] = [];
  
  try {
    const response = await safeFetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        // Cancel body to avoid leaving connection open
        response.body?.cancel();
        trace.push({
          step: 'fetch',
          observed: `GET /llms.txt -> ${response.status} Not Found`,
          inference: 'No llms.txt file deployed at standard location',
        });
        trace.push({
          step: 'verdict',
          observed: 'File not found',
          inference: 'llms.txt absence means the endpoint hasn\'t adopted the llms.txt convention for AI-readable documentation',
        });
        return {
          status: 'warn',
          details: {
            exists: false,
            url,
            message: 'llms.txt not found',
          },
          trace,
        };
      }
      
      // Cancel body to avoid leaving connection open
      response.body?.cancel();
      trace.push({
        step: 'fetch',
        observed: `GET /llms.txt -> ${response.status} ${response.statusText}`,
        inference: 'Server returned an error when requesting llms.txt',
      });
      trace.push({
        step: 'verdict',
        observed: `HTTP ${response.status} error`,
        inference: 'Non-404 error suggests a server-side issue rather than simple absence of the file',
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

    trace.push({
      step: 'fetch',
      observed: `GET /llms.txt -> 200 OK`,
      inference: 'llms.txt file exists and is accessible',
    });

    const content = await readResponseText(response);
    const parsed = parseLlmsTxt(content);
    
    if (!parsed.valid) {
      trace.push({
        step: 'format_validate',
        observed: `Validation errors: ${parsed.errors.join('; ')}`,
        inference: 'File does not follow llms.txt specification format — cannot be reliably consumed by AI agents',
      });
      trace.push({
        step: 'verdict',
        observed: `${parsed.errors.length} format error(s)`,
        inference: 'Invalid format reduces the file\'s utility for AI-assisted navigation and documentation discovery',
      });
      return {
        status: 'fail',
        details: {
          exists: true,
          url,
          formatValid: false,
          errors: parsed.errors,
          message: 'Invalid llms.txt format',
        },
        trace,
      };
    }

    trace.push({
      step: 'format_validate',
      observed: `Title line present, ${parsed.links.length} markdown link(s) found`,
      inference: 'File follows llms.txt specification format',
    });

    // Check link reachability (sample up to 5 links to avoid too many requests)
    const linksToCheck = parsed.links.slice(0, 5);
    const linkChecks = await Promise.all(linksToCheck.map(link => checkLink(link, url)));
    const brokenLinks = linkChecks.filter(check => !check.reachable);
    const reachableLinks = linkChecks.filter(check => check.reachable);

    if (linksToCheck.length > 0) {
      trace.push({
        step: 'link_check',
        observed: `${reachableLinks.length}/${linksToCheck.length} sampled links reachable${brokenLinks.length > 0 ? `, broken: ${brokenLinks.map(l => l.url).join(', ')}` : ''}`,
        inference: brokenLinks.length === 0
          ? 'Documentation links are maintained and accessible'
          : `${brokenLinks.length} broken link(s) found — documentation may be stale or URLs have changed`,
      });
    } else {
      trace.push({
        step: 'link_check',
        observed: 'No links found to verify',
        inference: 'File has valid format but contains no links — limited utility for documentation discovery',
      });
    }

    const status = brokenLinks.length === 0 ? 'pass' : 'warn';

    trace.push({
      step: 'verdict',
      observed: `Valid format, ${parsed.links.length} total link(s), ${brokenLinks.length} broken`,
      inference: status === 'pass'
        ? 'Well-maintained llms.txt with active documentation'
        : `Valid llms.txt but ${brokenLinks.length} broken link(s) suggest incomplete maintenance`,
    });

    return {
      status,
      details: {
        exists: true,
        url,
        formatValid: true,
        linkCount: parsed.links.length,
        linksChecked: linkChecks.length,
        brokenLinks: brokenLinks.map(l => l.url),
        message: brokenLinks.length > 0 
          ? `${brokenLinks.length} broken link(s) found`
          : 'All links reachable',
      },
      trace,
    };
  } catch (error) {
    trace.push({
      step: 'fetch',
      observed: `GET /llms.txt -> Error: ${error instanceof Error ? error.message : String(error)}`,
      inference: 'Unable to reach the llms.txt endpoint',
    });
    trace.push({
      step: 'verdict',
      observed: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      inference: 'Cannot assess llms.txt without reaching the server — network issue or server is down',
    });
    return {
      status: 'fail',
      details: {
        exists: false,
        url,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to fetch llms.txt',
      },
      trace,
    };
  }
}
