# Contributing

Thanks for helping. Playbill is young, so please open an issue before a large change so we can
agree on the approach.

## Setup

Requires Node 24 and pnpm 11.

```bash
pnpm install
pnpm dev
```

The worker prints a setup code on first start (also written to `data/setup-code.txt`). You need a
Plex server you own and a Tautulli instance to get through setup.

## Before opening a pull request

```bash
pnpm typecheck
pnpm test
pnpm build
```

- **Database changes:** edit `packages/core/src/db/schema.ts`, then run
  `pnpm db:generate --name <what-changed>` and commit the generated migration. Never edit a
  migration that has been released.
- **Background work:** handlers in `apps/worker/src/jobs.ts` must be safe to run twice. A job's
  lease can expire and the job can be retried.
- **Sending email:** never send to real recipients from tests or demo mode.
- **Secrets:** API keys and tokens are stored encrypted (`packages/core/src/crypto.ts`) and must
  never be logged; `log.ts` redacts common patterns, but don't rely on it.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org), e.g. `feat(digest): add coming-soon section`.
