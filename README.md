# Playbill

**Newsletters, new-arrival alerts and user management for Plex server owners.**

Playbill keeps the people you share your Plex server with in the loop, and gives you a clearer
picture of who actually uses it.

- **Newsletters:** a recurring digest with recently added titles, what's coming soon, filled
  requests and server stats, designed to look good in every mail client.
- **Alerts:** "it's here" emails when something lands, batched so ten episodes become one email.
  They go to everyone, a group, chosen people, or the people who follow that show.
- **Insights:** who's active, who has gone quiet, peak hours, devices, and what nobody watches.
- **People management:** invite users, change their library access, nudge inactive users, and
  clean up long-inactive shares. Warnings go out automatically; removals always wait for your
  approval.
- **Monthly recaps:** a personal year-in-review style email for each user, every month.

> **Status: early development.** The foundation and setup wizard work; insights, newsletters and
> user management are being built. See [docs/PROGRESS.md](docs/PROGRESS.md). Not ready for
> production use yet.

## Requirements

- A Plex Media Server you own
- [Tautulli](https://tautulli.com) (watch history and users)
- Optional: Seerr, Overseerr or Jellyseerr (requests); Sonarr and Radarr (coming soon, removals)
- An email provider: any SMTP server (Gmail, Brevo, Amazon SES, Mailgun…) or Resend

## Install

### Docker Compose

```yaml
services:
  playbill:
    image: ghcr.io/ahamedzoha/playbill:latest
    container_name: playbill
    restart: unless-stopped
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
    volumes:
      - ./config:/config
    ports:
      - 5056:5056
```

```bash
docker compose up -d
docker compose logs playbill | grep "Setup code"
```

Open `http://<your-server>:5056`, enter the setup code from the logs, sign in with the Plex account
that owns your server, and connect Tautulli.

The setup code is also written to `config/setup-code.txt`. It proves the person running the wizard
controls the install, so nobody who finds a fresh instance first can claim it.

### docker run

```bash
docker run -d --name playbill \
  -e PUID=1000 -e PGID=1000 -e TZ=Etc/UTC \
  -v ./config:/config -p 5056:5056 \
  --restart unless-stopped \
  ghcr.io/ahamedzoha/playbill:latest
```

## Configuration

Almost everything is set in the web UI. Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PUID` / `PGID` | `1000` | User and group that own `/config` |
| `TZ` | `UTC` | Timezone for schedules (the UI setting wins once set) |
| `PORT` | `5056` | Port inside the container |
| `PLAYBILL_SECRET_KEY` | generated | Overrides the generated encryption key (see below) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

`/config` holds:

| Path | What |
|---|---|
| `playbill.db` | SQLite database |
| `secret.key` | Encrypts stored API keys and signs links in emails. Keep it with your backups; without it, stored keys must be re-entered and old unsubscribe links stop working. |
| `backups/` | Nightly database backups (newest 7), plus a copy before every upgrade that changes the database |

## Image tags

| Tag | Built from |
|---|---|
| `latest`, `X.Y.Z`, `X.Y` | Releases |
| `edge` | Every commit to `main` (amd64 only) |
| `sha-<short>` | A specific commit, for pinning or rollback |

## Development

```bash
pnpm install
pnpm dev          # web on http://localhost:3000, worker alongside; data in ./data
pnpm test
pnpm typecheck
```

The repo is a pnpm workspace:

- `apps/web` is the Next.js app: setup wizard, admin UI, public pages and the API.
- `apps/worker` is the background process: migrations, scheduler, jobs and sending.
- `packages/core` holds the shared code: database schema, domain logic and API clients.

Both apps share one SQLite database. Only the worker runs migrations.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
