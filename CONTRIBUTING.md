# Contributing to Sockr

Thanks for taking the time to contribute. This document covers setup, workflow, and conventions.

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) 10+ (`npm install -g pnpm`)

## Local Setup

```bash
git clone https://github.com/Dev-180Memes/sockr.git
cd sockr
pnpm install
pnpm build        # build all packages once so workspace cross-references resolve
```

## Monorepo Structure

```
packages/
  shared/   sockr-shared  — TypeScript types, enums, interfaces
  server/   sockr-server  — Socket.IO server + plugins
  client/   sockr-client  — SocketClient class + React hooks
```

`sockr-server` and `sockr-client` both depend on `sockr-shared` via `workspace:*`. Changes to shared types must be backwards-compatible or coordinated with a version bump.

## Development

```bash
pnpm dev          # watch mode across all packages in parallel
```

Or work on a single package:

```bash
cd packages/server
pnpm dev
```

## Testing

Tests live in `packages/*/src/__tests__/`. Run the full suite from the root:

```bash
pnpm test                 # all packages
pnpm test:coverage        # with coverage report
```

Run a single file:

```bash
pnpm test -- --testPathPattern=VoicePlugin
```

All tests must pass before a PR will be merged.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat(server): add Redis queue adapter
fix(client): prevent double-authentication on reconnect
docs: update useVoiceCall React Native section
chore: bump pnpm to 10.28.1
```

Scopes: `server`, `client`, `shared`, `docs`, `ci`.

## Pull Requests

1. Fork the repo and create a branch from `main`.
2. Make your changes, add or update tests.
3. Run `pnpm test` — all tests must pass.
4. Run `pnpm build` — must compile without errors.
5. Open a PR against `main` and fill in the PR template.

PRs that touch multiple packages should include a note on why they are bundled (coordinated type change, feature spanning both sides, etc.).

## Adding a New Package

If you add a fourth package under `packages/`:

- Add it to `pnpm-workspace.yaml` (it is already covered by `packages/**`).
- Follow the same `tsup.config.ts` + `publishConfig.access: "public"` pattern.
- Add it to the root `README.md` packages table.

## Versioning

Packages are versioned independently. When a release is needed:

1. Bump the version in the relevant `package.json` (follow [semver](https://semver.org)).
2. Update `CHANGELOG.md`.
3. Open a PR with only the version bump and changelog entry.
4. After merge, create a GitHub Release — the publish workflow will push to npm automatically.

See the [publish workflow](.github/workflows/publish.yml) for details.

## Code Style

- TypeScript strict mode is enabled everywhere.
- No `any` without a comment explaining why.
- Prefer explicit return types on exported functions.
- React hooks follow the [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks).

## License

By contributing you agree that your contributions will be licensed under the MIT License.
