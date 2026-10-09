INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "id", 'HOME_CONTENT_MANAGE'::"Permission"
FROM "Role"
WHERE "name" IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("roleId", "permission") DO NOTHING;
