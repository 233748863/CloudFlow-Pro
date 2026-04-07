-- =========================================================
-- CloudFlow Pro - 全量初始化入口脚本
-- 用法：
-- 1. 进入 mysql 客户端后先切换到当前 DB 目录
-- 2. 执行：source 00.cloudflow-init-all.sql
-- 导入顺序：
-- 1. 01.cloudflow-common.sql
-- 2. 02.cloudflow-workflow.sql
-- 3. 03.cloudflow-hr.sql
-- 4. 04.cloudflow-oa.sql
-- 5. 06.cloudflow-business-seed.sql
-- =========================================================

SOURCE 01.cloudflow-common.sql;
SOURCE 02.cloudflow-workflow.sql;
SOURCE 03.cloudflow-hr.sql;
SOURCE 04.cloudflow-oa.sql;
SOURCE 06.cloudflow-business-seed.sql;
