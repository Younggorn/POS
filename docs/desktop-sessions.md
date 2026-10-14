# Desktop login sessions

Desktop v0.3 sends `X-POS-Client: desktop` when connecting to the configured POS origin. Successful password authentication then creates an `auth_sessions` row with `expiresAt = NULL`. This header chooses retention only; it does not bypass passwords, employee/position status, or permissions.

Browser logins retain the existing 12-hour expiry. The migration makes `expiresAt` nullable and preserves all existing expiry timestamps. Existing Desktop users must logout/login once after upgrading; an old expiring token is not converted automatically.

Chromium cookies have a finite retention limit, so the Desktop client also stores its token using Windows OS encryption and restores/renews the cookie when appropriate. Passwords are not stored. Logout clears the local vault/cookie and requests server-side token deletion. Disabled employees/positions, revoked sessions and password-change revocation continue to work.

Deploy with `docker compose up -d --build --no-deps web`; the startup command applies migrations. Verify using:

```sh
docker compose exec -T web pnpm exec tsx scripts/verify-desktop-sessions.ts
```

The verifier creates a uniquely named temporary employee/position, checks non-expiring Desktop sessions, logout, account disabling and browser expiry, then removes only its own fixtures/logs. It does not create sales or alter real staff accounts.
