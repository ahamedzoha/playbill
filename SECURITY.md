# Security

Playbill stores your Plex owner token, which can manage who has access to your server. Please
report vulnerabilities privately through
[GitHub security advisories](https://github.com/ahamedzoha/playbill/security/advisories/new),
not in public issues.

## How Playbill protects your install

- **Claiming a fresh install** needs a one-time setup code from the container logs.
- **Admin access** is by Plex sign-in, and only for the server owner and accounts the owner adds.
- **Stored secrets:** API keys and tokens are encrypted at rest with a key kept in `/config`.
- **Webhooks** need a per-source secret token.
- **Unsubscribe and image links in emails** are HMAC-signed.
- **Removing a user's access** always needs an explicit admin approval and is recorded in the
  audit log.

## Supported versions

Only the latest release receives security fixes.
