INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", grantable.permission_name::"Permission"
FROM "Role" AS r
CROSS JOIN (
  VALUES ('USER_MANAGE'), ('AUDIT_READ')
) AS grantable(permission_name)
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("roleId", "permission") DO NOTHING;
