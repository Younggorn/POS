-- NULL means a revocable desktop session with no time-based expiration.
-- Existing browser/session expiry timestamps are preserved.
ALTER TABLE "auth_sessions" ALTER COLUMN "expiresAt" DROP NOT NULL;
