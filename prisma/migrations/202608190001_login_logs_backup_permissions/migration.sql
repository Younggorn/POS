CREATE TABLE "login_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "employeeId" INTEGER REFERENCES "employees"("id") ON DELETE SET NULL,
  "username" VARCHAR(50) NOT NULL,
  "eventType" VARCHAR(16) NOT NULL,
  "success" BOOLEAN NOT NULL,
  "reason" VARCHAR(40),
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(500),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "login_logs_occurredAt_idx" ON "login_logs"("occurredAt");
CREATE INDEX "login_logs_employeeId_occurredAt_idx" ON "login_logs"("employeeId", "occurredAt");
CREATE INDEX "login_logs_eventType_success_occurredAt_idx" ON "login_logs"("eventType", "success", "occurredAt");

CREATE TABLE "system_audit_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "action" VARCHAR(40) NOT NULL,
  "actorId" INTEGER,
  "actorName" VARCHAR(100),
  "target" VARCHAR(255),
  "success" BOOLEAN NOT NULL,
  "detail" VARCHAR(500),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "system_audit_logs_action_occurredAt_idx" ON "system_audit_logs"("action", "occurredAt");
CREATE INDEX "system_audit_logs_actorId_occurredAt_idx" ON "system_audit_logs"("actorId", "occurredAt");

INSERT INTO "position_permissions" ("positionId", "menuId")
SELECT DISTINCT permission."positionId", menu."menuId"
FROM "position_permissions" permission
CROSS JOIN (VALUES ('login-logs'), ('backup')) AS menu("menuId")
WHERE permission."menuId" = 'access-control'
ON CONFLICT ("positionId", "menuId") DO NOTHING;
