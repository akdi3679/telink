# Telink Documentation

> Living docs. Every feature gets its own file under `features/`. Updated on every change.

## Index

### Getting started
- `features/auth.md` — authentication, signup, login, sessions

### Feature docs (living)

Every feature we ship has a file here. Format is fixed (see `features/_template.md`).

| Feature | File | Status |
|---|---|---|
| Auth (signup + login) | `features/auth.md` | 🔄 Being reworked to OIDC |

## How to update these docs

1. Every time we add/change a feature, the corresponding `features/<name>.md` must be updated.
2. Sections must stay in the same order.
3. Changes go in the **Changelog** section at the bottom.
4. If you add a new feature, copy `features/_template.md` and fill it in.

This is mandatory. No code merge without doc update.