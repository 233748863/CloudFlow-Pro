#!/bin/sh
set -eu

# 术语 = 数据库初始化校验，具体含义：在 MySQL 首次执行 initdb 脚本后，立即验证关键业务表是否全部创建完成。
RESULT="$(mysql -N -s -u root -p"${MYSQL_ROOT_PASSWORD}" cloud_flow_db -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'cloud_flow_db' AND table_name IN ('sys_user','wf_process_definition','hr_employee','oa_contract','crm_customer');")"

if [ "${RESULT}" != "5" ]; then
    echo "ERROR: database initialization failed, expected 5 key tables but found ${RESULT}"
    exit 1
fi

TENANTS="$(mysql -N -s -u root -p"${MYSQL_ROOT_PASSWORD}" cloud_flow_db -e "SELECT COUNT(*) FROM sys_tenant WHERE tenant_id BETWEEN 100000 AND 100049 AND status='0' AND deleted=0;")"
if [ "${TENANTS}" != "50" ]; then
  echo "ERROR: demo seed expected 50 active tenants but found ${TENANTS}"
  exit 1
fi

USERS="$(mysql -N -s -u root -p"${MYSQL_ROOT_PASSWORD}" cloud_flow_db -e "SELECT COUNT(*) FROM sys_user WHERE tenant_id BETWEEN 100000 AND 100049 AND deleted=0;")"
if [ "${USERS}" -lt 2500 ]; then
  echo "ERROR: demo seed expected at least 2500 tenant users but found ${USERS}"
  exit 1
fi

ADMIN_TENANTS="$(mysql -N -s -u root -p"${MYSQL_ROOT_PASSWORD}" cloud_flow_db -e "SELECT COUNT(*) FROM (SELECT tenant_id FROM sys_user WHERE tenant_id BETWEEN 100000 AND 100049 AND user_name='admin' AND status='0' AND deleted=0 GROUP BY tenant_id) demo_admins;")"
if [ "${ADMIN_TENANTS}" != "50" ]; then
  echo "ERROR: demo seed expected admin login in all 50 tenants but found ${ADMIN_TENANTS}"
  exit 1
fi

# 逐表检查租户数据：每个带 tenant_id 的业务表至少有 50 条/租户。
# sys_tenant 是租户目录本身，按全库 50 条校验，不参与每租户检查。
MIN_ROWS_SQL="$(mysql -N -s -u root -p"${MYSQL_ROOT_PASSWORD}" cloud_flow_db <<'SQL'
SET SESSION group_concat_max_len=1000000;
SELECT GROUP_CONCAT(CONCAT('SELECT IF(COALESCE(MIN(c),0)<50, ''', t.table_name, ''', '''') FROM (SELECT tenant_id,COUNT(*) c FROM `', t.table_name, '` WHERE tenant_id BETWEEN 100000 AND 100049 GROUP BY tenant_id) q') SEPARATOR ' UNION ALL ') INTO @q
FROM information_schema.tables t
WHERE t.table_schema=DATABASE()
  AND t.table_name <> 'sys_tenant'
  AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema=t.table_schema AND c.table_name=t.table_name AND c.column_name='tenant_id');
PREPARE demo_check FROM @q;
EXECUTE demo_check;
DEALLOCATE PREPARE demo_check;
SQL
)"
if printf '%s\n' "${MIN_ROWS_SQL}" | grep -q '[^[:space:]]'; then
  echo "ERROR: one or more tenant tables contain fewer than 50 rows per tenant"
  printf '%s\n' "${MIN_ROWS_SQL}"
  exit 1
fi

echo "Database initialization verified"
