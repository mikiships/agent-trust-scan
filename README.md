# 🔍 Agent Trust Scan

[![Agent Trust Verified](https://img.shields.io/badge/Agent%20Trust-Verified-brightgreen)](https://github.com/agent-trust/scan)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@agent-trust/scan)](https://www.npmjs.com/package/@agent-trust/scan)

A CLI tool and GitHub Action that validates agent/tool endpoints across multiple protocols:

- **A2A (Agent-to-Agent)** - Validates Agent Cards at `/.well-known/agent.json`
- **llms.txt** - Validates AI-friendly documentation at `/llms.txt`
- **MCP (Model Context Protocol)** - Checks for MCP server metadata
- **Health Checks** - TLS certificates, latency, and connectivity

## 🚀 Quick Start

### CLI Usage

```bash
# Scan a single domain
npx @agent-trust/scan example.com

# Scan multiple domains from a file
npx @agent-trust/scan --domains domains.txt

# Output as JSON
npx @agent-trust/scan example.com --json

# Output as Markdown
npx @agent-trust/scan example.com --format markdown
```

### Install Globally

```bash
npm install -g @agent-trust/scan

agent-trust-scan example.com
```

## 📊 Example Output

```
Scan Report: example.com
Timestamp: 2026-02-03T19:00:00Z
Score: 75/100

✓ A2A Agent Card: PASS
  Name: Example Agent
  Version: 1.0.0
  Skills: 5
  Completeness: 85%

⚠ llms.txt: WARN
  Links: 12
  Broken links: 1

✓ Health Check: PASS
  Latency: 245ms
  TLS: Valid
  Certificate expires in: 89 days

⚠ MCP Server: WARN
  No MCP server metadata found

Summary:
  2/4 checks passed. 2 warning(s)
```

## 🔧 GitHub Action

Add agent trust scanning to your CI/CD pipeline:

```yaml
name: Agent Trust Scan

on:
  pull_request:
  push:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Scan agent endpoints
        uses: agent-trust/scan@v1
        with:
          domains: 'api.example.com,agents.example.com'
          fail-on: 'fail'  # or 'warn' for stricter checks
          format: 'markdown'
          post-comment: 'true'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `domains` | Comma-separated domains or path to file | Yes | - |
| `fail-on` | Fail on `warn` or `fail` | No | `fail` |
| `format` | Output format: `table`, `json`, `markdown` | No | `markdown` |
| `post-comment` | Post results as PR comment | No | `false` |
| `github-token` | GitHub token for PR comments | No | - |

### Action Outputs

| Output | Description |
|--------|-------------|
| `score` | Overall scan score (0-100) |
| `passed` | Whether all checks passed (`true`/`false`) |
| `report` | Full scan report (JSON) |

## 📋 What It Checks

### A2A Agent Card

Validates the A2A Agent Card specification at `/.well-known/agent.json`:

- ✅ Required fields: `name`, `url`, `version`, `skills`
- ✅ Optional fields: `description`, `provider`, `authentication`, `capabilities`
- ✅ Schema validation using Zod
- ✅ Field completeness score
- ✅ Authentication requirements detection

### llms.txt

Validates AI-friendly documentation at `/llms.txt`:

- ✅ Format validation (title, optional blockquote, sections)
- ✅ Link extraction and reachability checks
- ✅ Broken link detection

### Health Check

Validates basic connectivity and security:

- ✅ TLS certificate validity
- ✅ Certificate expiration warnings
- ✅ Response latency measurement
- ✅ HTTP status codes

### MCP Server

Checks for Model Context Protocol support:

- ✅ Detects MCP metadata at `/.well-known/mcp.json` or `/mcp.json`
- ✅ Validates tool declarations
- ✅ Schema validation

## 🛠️ Programmatic Usage

```typescript
import { scanDomain, formatReportTable } from '@agent-trust/scan';

const report = await scanDomain('example.com');
console.log(formatReportTable(report));

// Access individual checks
console.log(report.checks.a2a_agent_card.status); // 'pass' | 'warn' | 'fail'
console.log(report.score); // 0-100
```

## 📦 Domains File Format

Create a `domains.txt` file with one domain per line:

```
# Production endpoints
api.example.com
agents.example.com

# Staging endpoints
staging.example.com

# Partner integrations
partner1.example.org
partner2.example.net
```

Lines starting with `#` are treated as comments and ignored.

## 🎯 Exit Codes

The CLI returns appropriate exit codes for CI/CD integration:

- `0` - All checks passed
- `1` - One or more checks failed

## 🔒 Security

This tool makes HTTP requests to the provided domains to check for:
- Agent Cards
- Documentation files
- TLS certificates
- Health endpoints

**No sensitive data is collected or transmitted.** All checks are read-only.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © 2026 Agent Trust

## 🔗 Resources

- [A2A Protocol Specification](https://github.com/a2a-protocol/spec)
- [llms.txt Specification](https://llmstxt.org/)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

## 🎖️ Badge

Show that your agent endpoints are validated:

```markdown
[![Agent Trust Verified](https://img.shields.io/badge/Agent%20Trust-Verified-brightgreen)](https://github.com/agent-trust/scan)
```

[![Agent Trust Verified](https://img.shields.io/badge/Agent%20Trust-Verified-brightgreen)](https://github.com/agent-trust/scan)
