# Claude Code Instructions

## Commit Guidelines

- Do NOT add co-authorship lines to commits (no `Co-Authored-By` headers)
- Keep commit messages concise and focused on the "why"

## Pre-Commit Checklist

Before committing ANY changes, run these checks and fix all issues:

### Rust (contracts/packages)
1. `cargo fmt --all -- --check` — code must be formatted per rustfmt.toml
2. `cargo clippy --workspace --all-targets -- -D warnings` — no clippy warnings
3. `cargo test --workspace` — all tests must pass

### Frontend (frontend/)
1. `cd frontend && npx eslint .` — no ESLint errors
2. `cd frontend && npx tsc --noEmit` — no TypeScript errors
3. `cd frontend && npx vitest run` — all tests must pass
4. `cd frontend && npm run build` — Next.js production build must succeed (catches errors tsc alone misses)

### General
- No `console.log` or `dbg!()` left in committed code (unless intentional logging)
- No `TODO` or `FIXME` introduced without a corresponding GitHub issue
- Commit messages follow conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`
- One logical change per commit — don't mix unrelated changes
