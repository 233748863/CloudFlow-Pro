-- M0-4: 核心业务实体补乐观锁版本列
-- 说明：
-- 1. 本脚本面向已存在环境，给当前优先收口的核心业务表补 version 列。
-- 2. 新列默认 0，由 MyBatis-Plus OptimisticLockerInnerInterceptor 配合 @Version 使用。

ALTER TABLE biz_payment_request
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE biz_purchase_request
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE biz_business_trip
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_contract
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_budget_plan
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_budget_adjustment
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_lead
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_quote
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_receivable
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_renewal
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_time_request
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_offer
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_salary_slip
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_certificate_request
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;
