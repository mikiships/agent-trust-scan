import { buildUrl, safeFetch, readResponseText } from '../utils.js';
import type { CheckResult } from '../types.js';
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
  
  try {
    const response = await safeFetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        return {
          status: 'warn',
          details: {
            exists: false,
            url,
            message: 'llms.txt not found',
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

    const content = await readResponseText(response);
    const parsed = parseLlmsTxt(content);
    
    if (!parsed.valid) {
      return {
        status: 'fail',
        details: {
          exists: true,
          url,
          formatValid: false,
          errors: parsed.errors,
          message: 'Invalid llms.txt format',
        },
      };
    }

    // Check link reachability (sample up to 5 links to avoid too many requests)
    const linksToCheck = parsed.links.slice(0, 5);
    const linkChecks = await Promise.all(linksToCheck.map(link => checkLink(link, url)));
    const brokenLinks = linkChecks.filter(check => !check.reachable);

    return {
      status: brokenLinks.length === 0 ? 'pass' : 'warn',
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
    };
  } catch (error) {
    return {
      status: 'fail',
      details: {
        exists: false,
        url,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to fetch llms.txt',
      },
    };
  }
}
