# Contributing to Agent Trust Scan

Thank you for your interest in contributing! 🎉

## Getting Started

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/your-username/agent-trust-scan.git
   cd agent-trust-scan
   ```
3. **Install dependencies**
   ```bash
   npm install
   ```
4. **Build the project**
   ```bash
   npm run build
   ```
5. **Run tests**
   ```bash
   npm test
   ```

## Development Workflow

### Project Structure

```
src/
├── cli.ts              # CLI entry point
├── scanner.ts          # Main orchestrator
├── report.ts           # Output formatters
├── types.ts            # TypeScript types & Zod schemas
├── utils.ts            # Shared utilities
├── scanners/           # Individual protocol scanners
│   ├── a2a.ts
│   ├── llms-txt.ts
│   ├── health.ts
│   └── mcp.ts
└── __tests__/          # Unit tests
```

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, documented code
   - Follow existing code style
   - Add tests for new features
   - Update README.md if needed

3. **Test your changes**
   ```bash
   npm run build
   npm test
   
   # Manual testing
   node dist/cli.js example.com
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```
   
   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation only
   - `test:` - Adding tests
   - `refactor:` - Code refactoring
   - `chore:` - Maintenance tasks

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Adding a New Scanner

To add support for a new protocol:

1. **Create scanner file**: `src/scanners/your-protocol.ts`
   ```typescript
   import type { CheckResult } from '../types.js';
   import { buildUrl, fetchWithTimeout } from '../utils.js';

   export async function scanYourProtocol(domain: string): Promise<CheckResult> {
     const url = buildUrl(domain, '/your-endpoint');
     
     try {
       const response = await fetchWithTimeout(url);
       
       if (!response.ok) {
         return {
           status: 'warn',
           details: { exists: false, message: 'Endpoint not found' }
         };
       }
       
       // Validate and return results
       return {
         status: 'pass',
         details: { exists: true, /* your data */ }
       };
     } catch (error) {
       return {
         status: 'fail',
         details: { error: String(error) }
       };
     }
   }
   ```

2. **Add to orchestrator**: Update `src/scanner.ts`
   ```typescript
   import { scanYourProtocol } from './scanners/your-protocol.js';
   
   const results = await Promise.all([
     // ... existing scanners
     scanYourProtocol(normalized),
   ]);
   ```

3. **Add tests**: Create `src/__tests__/your-protocol.test.ts`

4. **Update types**: Add to `ScanReport` interface if needed

## Code Style

- **TypeScript strict mode** - All type errors must be resolved
- **ESM modules** - Use `.js` extensions in imports
- **Error handling** - Wrap network calls in try/catch
- **Timeouts** - All fetch calls must timeout
- **Comments** - Document complex logic
- **No console.log** - Use proper reporting

## Testing Guidelines

- Mock external network calls
- Test both success and failure cases
- Test edge cases (malformed data, timeouts, etc.)
- Aim for >80% code coverage

## Documentation

When adding features:
- Update README.md with usage examples
- Document new CLI flags or options
- Add JSDoc comments for public APIs
- Update IMPLEMENTATION.md if architecture changes

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues before creating new ones

## Code of Conduct

Be respectful, inclusive, and collaborative. We're all here to build something useful.

---

Thank you for contributing! 🙏
