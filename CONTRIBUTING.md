# Contributing Guide

---

## Getting Started

### Prerequisites

- [Git](https://git-scm.com/)
- [Bun](https://bun.sh/) v1.2.12+
- [Claude Code](https://github.com/anthropics/claude-code) and/or [OpenCode](https://github.com/anomalyco/opencode)

### Setup

Fork the repository via GitHub UI, then:

```bash
git clone https://github.com/YOUR_USERNAME/clopen.git
cd clopen
git remote add upstream https://github.com/myrialabs/clopen.git
bun install
bun run check
```

### Data Directory

When running `bun run dev`, Clopen stores data in `~/.clopen-dev` instead of `~/.clopen`. This keeps development data separate from any production instance — especially important since Clopen can be used to develop itself.

### Keep Updated

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

---

## Branch Naming

Format: `<type>/<description>`

| Type | Use |
|------|-----|
| `feature/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation |
| `chore/` | Other changes |

Examples: `feature/database-management`, `fix/websocket-connection`

---

## Commit Messages

Format: `<type>(<scope>): <subject>`

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `chore` | Refactor, build, perf |
| `release` | Version release |

Rules: imperative mood, lowercase, no period, max 72 chars.

Examples:
```
feat(chat): add message export
fix(terminal): resolve memory leak
chore: update dependencies
```

---

## Development Workflow

```bash
# 1. Sync
git checkout main && git pull upstream main

# 2. Branch
git checkout -b feature/your-feature

# 3. Develop & verify
bun run check && bun run lint && bun run build

# 4. Commit & push
git commit -m "feat(scope): description"
git push origin feature/your-feature
```

Open a PR targeting the `dev` branch on GitHub.

---

## Pre-commit Checklist

- [ ] `bun run check` passes
- [ ] `bun run lint` passes
- [ ] `bun run build` works
- [ ] Commit message follows format
- [ ] No `console.*` (use `debug` module)
- [ ] No sensitive data

---

## Code Style

### TypeScript

- Use `const` by default; `let` only when reassignment is needed
- `any` is allowed for Elysia/WS patterns

### Svelte 5

Use runes. `let` for `$state`/`$bindable`; `const` for everything else.

```svelte
<script lang="ts">
  let count = $state(0);
  const doubled = $derived(count * 2);
  const handleClick = () => count++;
</script>
```

### Naming

- `camelCase` — variables, functions
- `PascalCase` — classes, types
- `UPPER_SNAKE_CASE` — constants
- `kebab-case` — file names

### Logging

```typescript
import { debug } from './utils/debug';
debug.log('message', { data });
```

### Formatting

Tabs, single quotes, semicolons. No prettier enforcement.

---

## Commands

```bash
bun run dev          # Dev server
bun run check        # Type check
bun run lint         # Lint
bun run lint:fix     # Auto-fix lint
bun run build        # Build
```

---

## Troubleshooting

```bash
# Type errors
rm -rf node_modules && bun install

# Lint errors
bun run lint:fix

# Git conflicts
git fetch upstream && git rebase upstream/main
```

---

## Resources

- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [Svelte 5 Docs](https://svelte.dev/docs/svelte/overview)
- [Bun Docs](https://bun.sh/docs)
- [Elysia Docs](https://elysiajs.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

## Questions?

- [Issues](https://github.com/myrialabs/clopen/issues)
- [Discussions](https://github.com/myrialabs/clopen/discussions)
