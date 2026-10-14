CREATE TABLE "positions" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(80) NOT NULL UNIQUE,
  "description" VARCHAR(200),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "position_permissions" (
  "positionId" INTEGER NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
  "menuId" VARCHAR(40) NOT NULL,
  PRIMARY KEY ("positionId", "menuId")
);
CREATE INDEX "position_permissions_menuId_idx" ON "position_permissions"("menuId");

CREATE TABLE "employees" (
  "id" SERIAL PRIMARY KEY,
  "username" VARCHAR(50) NOT NULL UNIQUE,
  "name" VARCHAR(100) NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "positionId" INTEGER NOT NULL REFERENCES "positions"("id") ON DELETE RESTRICT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "employees_positionId_active_idx" ON "employees"("positionId", "active");

CREATE TABLE "auth_sessions" (
  "id" BIGSERIAL PRIMARY KEY,
  "tokenHash" CHAR(64) NOT NULL UNIQUE,
  "employeeId" INTEGER NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "auth_sessions_employeeId_idx" ON "auth_sessions"("employeeId");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

INSERT INTO "positions" ("name", "description")
VALUES ('ผู้ดูแลระบบ', 'เข้าถึงและจัดการระบบได้ทุกเมนู');

INSERT INTO "position_permissions" ("positionId", "menuId")
SELECT p."id", menu."menuId"
FROM "positions" p
CROSS JOIN (VALUES
  ('dashboard'), ('pos'), ('sales'), ('products'), ('product-units'),
  ('purchase'), ('shelf-life'), ('returns'), ('customers'), ('shifts'),
  ('reports'), ('system'), ('access-control')
) AS menu("menuId")
WHERE p."name" = 'ผู้ดูแลระบบ';

INSERT INTO "employees" ("username", "name", "passwordHash", "positionId", "mustChangePassword")
SELECT 'admin', 'Administrator',
       'scrypt$50c074524c9467ae3b6c79f23531a0c4$3bcb172c4753932abd2b94e55ede6e65fb4ae05a90fd7e20d9e0275eb93b350eb53146fd7ae74cf2dd9e126bd422cb436d2e078512771062f240c84945683850',
       p."id", TRUE
FROM "positions" p WHERE p."name" = 'ผู้ดูแลระบบ';
