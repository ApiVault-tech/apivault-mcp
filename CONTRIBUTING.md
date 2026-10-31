# Contributing to ApiVault MCP Server

Thank you for your interest in contributing to the **ApiVault Remote MCP Server**. We welcome bug reports, feature requests, documentation improvements, and code contributions.

---

## Development Setup

1. **Fork and Clone:**
   ```bash
   git clone https://github.com/ApiVault-tech/apivault-mcp.git
   cd apivault-mcp
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

4. **Run Local Dev Server:**
   ```bash
   npm run dev
   ```

5. **Run Tests:**
   ```bash
   npm test
   ```

---

## Testing Guidelines

Before opening a pull request, ensure all unit tests pass cleanly and that the production build succeeds:

```bash
# Run vitest test suite
npm test

# Verify production build
npm run build
```

When adding a new tool or modifying client behavior, please include corresponding unit tests under `src/lib/` or `src/mcp/`.

---

## Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature or MCP tool
- `fix:` A bug fix
- `docs:` Documentation improvements
- `refactor:` Code refactoring without behavioral changes
- `test:` Adding or updating tests
- `chore:` Dependency bumps or tooling changes

---

## Reporting Issues

If you encounter a bug or unexpected behavior:
1. Check existing [GitHub Issues](https://github.com/ApiVault-tech/apivault-mcp/issues) to see if it has already been reported.
2. Open a new issue with a clear description, reproduction steps, and editor details (e.g. Cursor version, Claude Desktop version).

---

## License

By contributing to this repository, you agree that your contributions will be licensed under the project's **MIT License**.
