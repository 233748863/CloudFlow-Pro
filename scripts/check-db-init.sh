#!/bin/sh
set -eu

# 术语 = 数据库初始化校验，具体含义：在 MySQL 首次执行 initdb 脚本后，立即验证关键业务表是否全部创建完成。
RESULT="$(mysql -N -s -u root -p"${MYSQL_ROOT_PASSWORD}" cloud_flow_db -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'cloud_flow_db' AND table_name IN ('sys_user','wf_process_definition','hr_employee','oa_contract');")"

if [ "${RESULT}" != "4" ]; then
  echo "ERROR: database initialization failed, expected 4 key tables but found ${RESULT}"
  exit 1
fi

echo "Database initialization verified"
