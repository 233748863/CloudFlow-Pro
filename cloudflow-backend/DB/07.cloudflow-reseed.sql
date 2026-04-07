-- =========================================================
-- CloudFlow Pro - 清库后重刷数据入口脚本
-- 用法：
-- 1. 确保 01.cloudflow-common.sql ~ 04.cloudflow-oa.sql 已执行过，表结构已存在
-- 2. 进入 mysql 客户端后先切换到当前 DB 目录
-- 3. 执行：source 07.cloudflow-reseed.sql
-- 执行顺序：
-- 1. 05.cloudflow-clear-all.sql
-- 2. 06.cloudflow-business-seed.sql
-- =========================================================

SOURCE 05.cloudflow-clear-all.sql;
SOURCE 06.cloudflow-business-seed.sql;
