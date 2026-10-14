CREATE SEQUENCE "customer_number_seq" START WITH 1 INCREMENT BY 1;

SELECT setval(
  'customer_number_seq',
  COALESCE((SELECT MAX("code"::INTEGER) FROM "customers" WHERE "code" ~ '^[0-9]{6}$'), 0) + 1,
  false
);

INSERT INTO "position_permissions" ("positionId", "menuId")
SELECT DISTINCT permission."positionId", 'customer-management'
FROM "position_permissions" permission
WHERE permission."menuId" IN ('customers', 'access-control')
ON CONFLICT ("positionId", "menuId") DO NOTHING;
