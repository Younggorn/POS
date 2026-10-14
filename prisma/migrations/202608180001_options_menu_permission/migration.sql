INSERT INTO "position_permissions" ("positionId", "menuId")
SELECT DISTINCT permission."positionId", 'options'
FROM "position_permissions" permission
WHERE permission."menuId" IN ('system', 'access-control')
ON CONFLICT ("positionId", "menuId") DO NOTHING;
