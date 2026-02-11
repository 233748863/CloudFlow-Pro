-- ----------------------------
-- 数据库初始化脚本 (V3 - 全量中文注释 + 审计字段 + 软删除)
-- ----------------------------

-- 删除已存在的数据库（如果存在）
DROP DATABASE IF EXISTS `biz_alliance_merchant`;

-- 创建数据库
CREATE DATABASE `biz_alliance_merchant` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE `biz_alliance_merchant`;

-- 统一说明：
-- 每张表均新增以下通用审计与软删除字段：
--  created_by   BIGINT UNSIGNED NULL COMMENT '创建人ID'
--  created_time   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
--  updated_by   BIGINT UNSIGNED NULL COMMENT '修改人ID'
--  updated_time   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间'
--  is_deleted   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)'
--  deleted_time   TIMESTAMP NULL COMMENT '删除时间(软删除)'

-- ----------------------------
-- Part 1: MVP 阶段核心表
-- ----------------------------

-- 行业分类表
DROP TABLE IF EXISTS `industries`;
CREATE TABLE `industries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` VARCHAR(50) NOT NULL COMMENT '行业名称',
  `weight` INT NOT NULL DEFAULT 0 COMMENT '排序权重', 
  `description` VARCHAR(255) NULL COMMENT '行业分类描述',
  `is_enable` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '行业分类表';

-- 商品分类表
DROP TABLE IF EXISTS `product_categories`;
CREATE TABLE `product_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `parent_id` BIGINT UNSIGNED NULL COMMENT '父分类ID',
  `name` VARCHAR(100) NOT NULL COMMENT '分类名称',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序序号，值越大越靠后',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '商品分类表';

-- 会员等级表
DROP TABLE IF EXISTS `user_levels`;
CREATE TABLE `user_levels` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `level_name` VARCHAR(50) NOT NULL COMMENT '等级名称',
  `min_points` INT UNSIGNED NOT NULL COMMENT '升级所需最小积分',
  `discount_rate` DECIMAL(3, 2) NULL COMMENT '该等级专享折扣率，0.85表示85折',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '会员等级表';

-- 用户主表
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID(与`app_user`.id保持一致)',
  `wx_openid` VARCHAR(128) NOT NULL COMMENT '微信OpenID',
  `nickname` VARCHAR(100) NULL COMMENT '用户昵称',
  `avatar` VARCHAR(512) NULL COMMENT '用户头像URL',
  `phone` VARCHAR(20) NULL COMMENT '手机号',
  `gender` TINYINT NULL COMMENT '性别: 0-未知; 1-男; 2-女',
  `city_code` INT NULL COMMENT '城市编码',
  `province_code` INT NULL COMMENT '省份编码',
  `location` VARCHAR(50) NULL COMMENT '所在地区(解析city_code, province_code后得到, 冗余存储)',
  `level_id` BIGINT UNSIGNED NULL COMMENT '会员等级ID',
  `points_account` BIGINT UNSIGNED NULL COMMENT '积分账户ID',
  `status` VARCHAR(20) NOT NULL DEFAULT 'NORMAL' COMMENT '用户状态: NORMAL-正常; BANNED-封禁',
  `last_login_time` TIMESTAMP NULL COMMENT '最后登录时间',
  `invite_code` VARCHAR(20) NULL COMMENT '个人邀请码 (二期)',
  `inviter_id` BIGINT UNSIGNED NULL COMMENT '邀请我的用户ID (二期)',
  `is_enable` TINYINT(1) DEFAULT 1 COMMENT '用户状态: 0-禁用; 1-正常',
  `version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`user_id`),
  UNIQUE INDEX `uk_openid` (`wx_openid`),
  UNIQUE INDEX `uk_invite_code` (`invite_code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '用户信息表';

-- 用户收货地址表
DROP TABLE IF EXISTS `user_addresses`;
CREATE TABLE `user_addresses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `recipient_name` VARCHAR(50) NOT NULL COMMENT '收货人姓名',
  `phone` VARCHAR(20) NOT NULL COMMENT '收货人手机号',
  `province` VARCHAR(50) NOT NULL COMMENT '省',
  `city` VARCHAR(50) NOT NULL COMMENT '市',
  `district` VARCHAR(50) NOT NULL COMMENT '区/县',
  `detailed_address` VARCHAR(255) NOT NULL COMMENT '详细地址',
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否默认地址',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_user_id` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '用户收货地址表';

-- 积分账户表
DROP TABLE IF EXISTS `points_account`;
CREATE TABLE `points_account`
(
    `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `owner_id`            BIGINT UNSIGNED NOT NULL COMMENT '用户/商家ID',
    `owner_type`          VARCHAR(30) NOT NULL COMMENT '账号类型: MERCHANT-平台商家; USER-平台用户',
    `total_earned_points` INT UNSIGNED DEFAULT 0 COMMENT '累计获得积分',
    `available_points`    INT UNSIGNED DEFAULT 0 COMMENT '当前可用积分',
    `frozen_points`       INT UNSIGNED DEFAULT 0 COMMENT '当前冻结积分',
    `last_gain_time`      TIMESTAMP NULL COMMENT '最近获得积分时间',
    `last_deduct_time`    TIMESTAMP NULL COMMENT '最近扣除积分时间',
    `is_enable`           TINYINT(1) DEFAULT 1 COMMENT '积分账户状态: 0-冻结; 1-正常',

    `created_time`        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `created_by`          BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `updated_by`          BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`        TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分汇总表';

-- 积分批次表
DROP TABLE IF EXISTS `points_batch`;
CREATE TABLE `points_batch`
(
    `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '批次ID主键',
    `owner_id`          BIGINT UNSIGNED NOT NULL COMMENT '用户/商家ID',
    `owner_type`        VARCHAR(30) NOT NULL COMMENT '账号类型: MERCHANT-平台商家; USER-平台用户',
    `source_type`       VARCHAR(30) NOT NULL COMMENT '积分来源类型: ORDER_EARN-消费得; SIGN_IN_REWARD-签到; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; SYSTEM_ADJUST-系统调整; OTHERS-其他',
    `batch_points`      INT UNSIGNED DEFAULT 0 COMMENT '该批次积分数量',
    `used_points`       INT UNSIGNED DEFAULT 0 COMMENT '该批次已使用积分数量',
    `remaining_points`  INT UNSIGNED DEFAULT 0 COMMENT '该批次剩余积分数量',
    `first_expire_date` DATE NULL COMMENT '该批次积分最早过期时间(不包含已过期明细)',
    `batch_detail`      JSON        NOT NULL COMMENT 'JSON格式批次积分明细(业务ID/获取日期/数量/过期时间/可用数量等)',

    `created_time`      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `created_by`        BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `updated_by`        BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`        TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`      TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分批次表';

-- 积分流水表
DROP TABLE IF EXISTS `points_flow`;
CREATE TABLE `points_flow`
(
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '流水ID主键',
    `batch_id`        BIGINT UNSIGNED NOT NULL COMMENT '批次ID(关联points_batch.id)',
    `owner_id`        BIGINT UNSIGNED NOT NULL COMMENT '用户/商家ID',
    `owner_type`      VARCHAR(30) NOT NULL COMMENT '变动账号类型: MERCHANT-平台商家; USER-平台用户',
    `change_points`   INT         NOT NULL COMMENT '变更数量: 正为增加, 负为减少',
    `change_type`     VARCHAR(30) NOT NULL COMMENT '变动类型: ORDER_EARN-消费得; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; ORDER_SPEND-下单抵扣; MALL_REDEEM-商城兑换; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; EXPIRED_DEDUCT-过期扣除; OTHERS-其他',
    `biz_id`          BIGINT UNSIGNED NOT NULL COMMENT '业务唯一ID，用于幂等控制，如订单ID',
    `batch_gain_date` DATE        NOT NULL COMMENT '批次中获得积分日期',
    `remark`          VARCHAR(80) DEFAULT NULL COMMENT '变动备注',

    `created_time`    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `created_by`      BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `updated_by`      BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`    TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`),
    INDEX             `idx_owner_id` (`owner_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分流水表';

-- 积分过期日志
DROP TABLE IF EXISTS points_expiry_logs;
CREATE TABLE points_expiry_logs
(
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `owner_id`      BIGINT UNSIGNED NOT NULL COMMENT '用户/商家ID',
    `owner_type`    VARCHAR(30) NOT NULL COMMENT '所属账号类型: MERCHANT-平台商家; USER-平台用户',
    `source_id`     BIGINT UNSIGNED NOT NULL COMMENT '积分来源ID',
    `expiry_points` INT       NOT NULL COMMENT '过期积分数',
    `expiry_date`   DATE      NOT NULL COMMENT '过期日期',
    `created_by`    BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`    BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`  TIMESTAMP NULL COMMENT '删除时间(软删除)',
    INDEX           idx_owner_date (owner_id, expiry_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分过期日志';

-- 商家信息表
DROP TABLE IF EXISTS `merchants`;
CREATE TABLE `merchants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` VARCHAR(255) NOT NULL COMMENT '商家名称',
  `logo_url` VARCHAR(512) NULL COMMENT '商家Logo',
  `description` TEXT NULL COMMENT '商家简介',
  `contact_name` VARCHAR(50) NULL COMMENT '联系人姓名',
  `contact_phone` VARCHAR(20) NULL COMMENT '联系电话',
  `location` VARCHAR(50) NOT NULL COMMENT '商家所在地区',
  `address_detail` VARCHAR(512) NOT NULL COMMENT '商家详细地址',
  `industry_id` BIGINT UNSIGNED NULL COMMENT '行业ID',
  `region_code` JSON NULL COMMENT '区域代码',
  `legal_person` VARCHAR(50) NULL COMMENT '法人姓名',
  `commission_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '平台抽成比例(0-100)',
  `sub_mch_id`    VARCHAR(32) NULL COMMENT '子商户号(微信支付服务商模式)',
  `license_no` VARCHAR(255) NULL COMMENT '营业执照编号',
  `license_images` JSON NULL COMMENT '商家资质图片URL列表',
  `images`        JSON NULL COMMENT '商家图片URL列表',
  `agent_id` BIGINT UNSIGNED NULL COMMENT '所属区域代理ID (二期)',
  `points_account` BIGINT UNSIGNED NULL COMMENT '积分账户ID',
  `business_status` VARCHAR(20) NULL DEFAULT 'PREPARING' COMMENT '商家经营状态: PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业',
  `is_enable` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否被平台启用: true-启用; false-禁用',
  `audit_id` BIGINT UNSIGNED NULL COMMENT '当前审核记录ID(关联merchant_audit.id)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '商家信息表';

-- 商家审核信息表
DROP TABLE IF EXISTS `merchant_audit`;
CREATE TABLE `merchant_audit`
(
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `merchant_id`   BIGINT UNSIGNED NOT NULL COMMENT '商家ID(关联merchants.id)',
    `name`          VARCHAR(255) NOT NULL COMMENT '商家名称',
    `logo_url`      VARCHAR(512) NULL COMMENT '商家Logo',
    `description`   TEXT NULL COMMENT '商家简介',
    `contact_name`  VARCHAR(50) NULL COMMENT '联系人姓名',
    `contact_phone` VARCHAR(20) NULL COMMENT '联系电话',
    `location` VARCHAR(50) NOT NULL COMMENT '商家所在地区',
    `address_detail` VARCHAR(512) NOT NULL COMMENT '商家详细地址',
    `industry_id`   BIGINT UNSIGNED NULL COMMENT '行业ID',
    `region_code`   JSON NULL COMMENT '区域代码',
    `modify_reason` VARCHAR(255)   NOT NULL COMMENT '提交修改原因',
    `audit_status`  VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '审核状态: PENDING-待审核; APPROVED-通过; REJECTED-拒绝',
    `audit_type`    VARCHAR(20) NOT NULL DEFAULT 'CREATE' COMMENT '审核类型: CREATE-创建; REVISION-修改',
    `audit_remark`  VARCHAR(255) NULL COMMENT '审核备注',
    `audit_by`      BIGINT UNSIGNED NULL COMMENT '审核人ID',
    `audit_time`    TIMESTAMP NULL COMMENT '审核时间',
    `legal_person`  VARCHAR(50) NULL COMMENT '法人姓名',
    `sub_mch_id`    VARCHAR(32) NULL COMMENT '子商户号(微信支付服务商模式)',
    `license_no`    VARCHAR(255) NULL COMMENT '营业执照图片URL',
    `license_images`JSON NULL COMMENT '商家资质图片URL列表',
    `images`        JSON NULL COMMENT '商家图片URL列表',
    `business_status` VARCHAR(20) NULL DEFAULT 'PREPARING' COMMENT '商家经营状态: PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业',
    `is_enable` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否被平台启用: true-启用; false-禁用',

    `created_by`    BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`    BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`  TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '商家审核信息表';

-- 门店信息表
DROP TABLE IF EXISTS `stores`;
CREATE TABLE `stores` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `industry_id` BIGINT UNSIGNED NULL COMMENT '行业ID',
  `name` VARCHAR(255) NOT NULL COMMENT '门店名称',
  `description`   TEXT NULL COMMENT '门店简介',
  `location` VARCHAR(50) NOT NULL COMMENT '门店所在地区',
  `address_detail` VARCHAR(512) NOT NULL COMMENT '门店详细地址',
  `phone` VARCHAR(20) NULL COMMENT '联系电话',
  `logo_url` VARCHAR(512) NULL COMMENT '门店Logo',
  `images` JSON NULL COMMENT '门店图片列表(JSON)',
  `business_hours` VARCHAR(100) NULL COMMENT '营业时间',
  `license_no` VARCHAR(255) NULL COMMENT '营业执照编号',
  `license_images` JSON NULL COMMENT '门店资质图片URL列表',
  `region_code`   JSON NULL COMMENT '区域代码',
  `latitude` DECIMAL(8, 5) NOT NULL COMMENT '纬度',
  `longitude` DECIMAL(8, 5) NOT NULL COMMENT '经度',
  `store_score` DECIMAL(3, 1) DEFAULT 0.0 COMMENT '门店评分',
  `business_status` VARCHAR(20) NOT NULL DEFAULT 'CLOSED' COMMENT '门店营业状态: OPEN-营业中; CLOSED-已关店; RESTING-休息中; DELETED-已删除',
  `is_enable` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否被平台启用: true-启用; false-禁用',
  `audit_id` BIGINT UNSIGNED NULL COMMENT '当前审核记录ID(关联store_audit.id)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  
  KEY `idx_location` (`latitude`, `longitude`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '门店信息表';

-- 门店审核信息表
DROP TABLE IF EXISTS `store_audit`;
CREATE TABLE `store_audit`
(
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `store_id`      BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
    `merchant_id`   BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
    `industry_id` BIGINT UNSIGNED NULL COMMENT '行业ID',
    `name`          VARCHAR(255)   NOT NULL COMMENT '门店名称',
    `description`   TEXT NULL COMMENT '门店简介',
    `location` VARCHAR(50) NOT NULL COMMENT '门店所在地区',
    `address_detail` VARCHAR(512) NOT NULL COMMENT '门店详细地址',
    `phone`         VARCHAR(20) NULL COMMENT '联系电话',
    `logo_url`      VARCHAR(512) NULL COMMENT '门店Logo',
    `images`        JSON NULL COMMENT '门店图片列表(JSON)',
    `business_hours` VARCHAR(100) NULL COMMENT '营业时间',
    `license_no` VARCHAR(255) NULL COMMENT '营业执照编号',
    `license_images` JSON NULL COMMENT '门店资质图片URL列表',
    `region_code` JSON NULL COMMENT '区域代码',
    `latitude`      DECIMAL(10, 8) NOT NULL COMMENT '纬度',
    `longitude`     DECIMAL(11, 8) NOT NULL COMMENT '经度',
    `modify_reason` VARCHAR(255)   NOT NULL COMMENT '提交修改原因',
    `audit_status`  VARCHAR(20)    NOT NULL DEFAULT 'PENDING' COMMENT '审核状态: PENDING-待审核; APPROVED-通过; REJECTED拒绝',
    `audit_type`    VARCHAR(20)    NOT NULL DEFAULT 'CREATE' COMMENT '审核类型: CREATE-创建; DELETE-删除; REVISION-修改; BIZ_STATUS-营业状态修改',
    `audit_by`      BIGINT UNSIGNED NULL COMMENT '审核人ID',
    `audit_remark`  VARCHAR(255) NULL COMMENT '审核备注',
    `audit_time`    TIMESTAMP NULL COMMENT '审核时间',
    `business_status` VARCHAR(20) NOT NULL DEFAULT 'CLOSED' COMMENT '门店营业状态: OPEN-营业中; CLOSED-已关店; RESTING-休息中; DELETED-已删除',
    `is_enable` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否被平台启用: true-启用; false-禁用',

    `created_by`    BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`    BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`    TIMESTAMP NULL COMMENT '删除时间(软删除)'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '门店审核信息表';

-- 商品主表 (SPU)
DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `category_id` BIGINT UNSIGNED NULL COMMENT '商品分类ID',
  `name` VARCHAR(255) NOT NULL COMMENT '商品名称',
  `description` TEXT NULL COMMENT '商品描述',
  `main_image` VARCHAR(500) NULL COMMENT '商品主图URL',
  `detail_images` JSON NULL COMMENT '商品详情图片URL列表(JSON格式)',
  `detail_description` JSON NULL COMMENT '商品详情描述(JSON格式)',
  `attributes` JSON NULL COMMENT '商品属性(JSON格式)',
  `type` VARCHAR(20) NOT NULL DEFAULT 'PHYSICAL' COMMENT '商品类型: PHYSICAL(实物), SERVICE(服务)',
  `tags` JSON NULL COMMENT '商品标签，逗号分隔',
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '商品状态: DRAFT(草稿), PUBLISHED(上架), ARCHIVED(归档)',
  `sort_weight` INT NOT NULL DEFAULT 0 COMMENT '排序权重，值越大越靠前',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',
  `version` INT NOT NULL DEFAULT 0 COMMENT '版本号(乐观锁)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '商品主表 (SPU)';

-- 商品SKU表
DROP TABLE IF EXISTS `product_skus`;
CREATE TABLE `product_skus` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT 'SPU商品ID',
  `sku_name` VARCHAR(255) NOT NULL COMMENT '规格名，如: 大杯',
  `sku_code` VARCHAR(100) NULL COMMENT 'SKU编码/条码（69条码等）',
  `price` DECIMAL(10,2) NOT NULL COMMENT '价格(元,2位小数)',
  `original_price` DECIMAL(10,2) NULL COMMENT '原价(元,2位小数)，用于显示划线价',
  `stock` INT NOT NULL DEFAULT -1 COMMENT '库存，-1为无限库存',
  `warning_stock` INT NOT NULL DEFAULT 10 COMMENT '预警库存，低于此值时提醒补货',
  `spec_attributes` JSON NULL COMMENT 'SKU规格属性(JSON格式)，如颜色、尺寸等',
  `sku_image` VARCHAR(500) NULL COMMENT 'SKU专属图片URL',
  `weight` DECIMAL(8,3) NULL COMMENT '重量(kg)，用于物流计算',
  `volume` DECIMAL(8,3) NULL COMMENT '体积(立方米)，用于物流计算',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用: 0-禁用, 1-启用',
  `sort_weight` INT NOT NULL DEFAULT 0 COMMENT '排序权重，值越大越靠前',
  `marketing_config` JSON NULL COMMENT '营销配置(JSON)，例如: {"type":"LIMITED_TIME","startTime":"...","endTime":"..."}',
  `version` BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID，用于多租户隔离',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '商品SKU表';

-- 购物车表
DROP TABLE IF EXISTS `cart_items`;
CREATE TABLE `cart_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID (关联 users.id 或 app_user.user_id)',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT '商品ID (SPU)',
  `sku_id` BIGINT UNSIGNED NOT NULL COMMENT 'SKU ID',
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '购买数量',
  
  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_sku` (`user_id`, `sku_id`, `is_deleted`) COMMENT '用户+SKU唯一索引(防止重复添加)',
  KEY `idx_user_id` (`user_id`),
  KEY `idx_merchant_id` (`merchant_id`),
  KEY `idx_updated_time` (`updated_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '购物车表';

-- 订单主表
DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_no` VARCHAR(32) NOT NULL COMMENT '订单号',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '下单用户ID',
  `store_id` BIGINT UNSIGNED default 0 COMMENT '下单门店ID',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `coupon_id` BIGINT UNSIGNED NULL COMMENT '使用的优惠券ID',
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT' COMMENT '订单状态: PENDING_PAYMENT 待支付等',
  `remark` VARCHAR(255) NULL COMMENT '订单备注',
  `total_product_price` DECIMAL(10,2) NOT NULL COMMENT '商品总原价(元,2位小数)',
  `total_discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '总优惠金额(元,2位小数)',
  `coupon_discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '优惠券优惠金额(元,2位小数)',
  `points_discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '积分抵扣金额(元,2位小数)',
  `final_paid_price` DECIMAL(10,2) NOT NULL COMMENT '最终实付金额(元,2位小数)',
  `version` BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `payment_method` VARCHAR(20) NULL COMMENT '支付方式，如 WECHAT_PAY',
  `payment_time` TIMESTAMP NULL COMMENT '支付时间',
  `completion_time` TIMESTAMP NULL COMMENT '完成时间',
  `cancel_time` TIMESTAMP NULL COMMENT '取消时间',
  `cancel_reason` VARCHAR(255) NULL COMMENT '取消原因',
  `expire_time` TIMESTAMP NULL COMMENT '订单过期时间(用于超时自动关单)',
  `verification_code` VARCHAR(10) NULL COMMENT '核销码',

  `pay_batch_no` VARCHAR(32) NULL COMMENT '支付批次号(用于合并支付)',
  `profit_sharing_status` INT NOT NULL DEFAULT 0 COMMENT '分账状态: 0-无需分账 1-待分账 2-分账中 3-分账完成 4-分账失败',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_order_no` (`order_no`),
  INDEX `idx_user_status` (`user_id`, `status`),
  INDEX `idx_store_status` (`store_id`, `status`),
  INDEX `idx_merchant_status` (`merchant_id`, `status`),
  INDEX `idx_status_created` (`status`, `created_time`),
  INDEX `idx_verification_code` (`verification_code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单主表';

-- 订单商品子表
DROP TABLE IF EXISTS `order_items`;
CREATE TABLE `order_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `product_sku_id` BIGINT UNSIGNED NOT NULL COMMENT 'SKU ID',
  `product_id` BIGINT UNSIGNED NULL COMMENT '商品ID',
  `sku_code` VARCHAR(100) NULL COMMENT 'SKU编码',
  `product_name` VARCHAR(255) NOT NULL COMMENT '商品名称快照',
  `product_image` VARCHAR(512) NULL COMMENT '商品图片快照',
  `sku_name` VARCHAR(255) NULL COMMENT 'SKU规格名称快照',
  `quantity` INT UNSIGNED NOT NULL COMMENT '数量',
  `original_price` DECIMAL(10,2) NOT NULL COMMENT 'SKU单价(元,2位小数)',
  `apportioned_discount` DECIMAL(10,2) NOT NULL COMMENT '分摊优惠(元,2位小数)',
  `final_price` DECIMAL(10,2) NOT NULL COMMENT '实付金额(元,2位小数)',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_order_id` (`order_id`),
  INDEX `idx_product_sku_id` (`product_sku_id`),
  INDEX `idx_product_id` (`product_id`),
  INDEX `idx_sku_code` (`sku_code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单商品子表';

-- 订单地址快照表（用于本地配送场景）
DROP TABLE IF EXISTS `order_address_snapshots`;
CREATE TABLE `order_address_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `user_id` BIGINT UNSIGNED NULL COMMENT '用户ID',
  `merchant_id` BIGINT UNSIGNED NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NULL COMMENT '门店ID',
  `receiver_name` VARCHAR(64) NOT NULL COMMENT '收货人姓名',
  `receiver_phone` VARCHAR(20) NOT NULL COMMENT '收货人手机号',
  `province` VARCHAR(64) NULL COMMENT '省',
  `city` VARCHAR(64) NULL COMMENT '市',
  `district` VARCHAR(64) NULL COMMENT '区/县',
  `detail_address` VARCHAR(255) NOT NULL COMMENT '详细地址',
  `latitude` DECIMAL(10,6) NULL COMMENT '纬度',
  `longitude` DECIMAL(10,6) NULL COMMENT '经度',
  `address_type` VARCHAR(20) NOT NULL DEFAULT 'RECEIVER' COMMENT '地址类型: RECEIVER(收货地址)',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_order_id` (`order_id`),
  INDEX `idx_store_id` (`store_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单地址快照表';

-- 订单配送记录表（用于本地配送/同城配送）
DROP TABLE IF EXISTS `order_delivery_records`;
CREATE TABLE `order_delivery_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `address_snapshot_id` BIGINT UNSIGNED NULL COMMENT '地址快照ID(order_address_snapshots.id)',
  `channel` VARCHAR(32) NOT NULL DEFAULT 'LOCAL' COMMENT '配送渠道: LOCAL(自配送), THIRD_PARTY(第三方)',
  `provider` VARCHAR(32) NULL COMMENT '第三方服务商编码/名称',
  `tracking_no` VARCHAR(100) NULL COMMENT '运单号/配送单号',
  `status` VARCHAR(20) NOT NULL DEFAULT 'CREATED' COMMENT '配送状态: CREATED, ASSIGNED, PICKED, DELIVERING, DELIVERED, FAILED, CANCELLED',
  `delivery_person_name` VARCHAR(50) NULL COMMENT '配送员姓名',
  `delivery_person_phone` VARCHAR(20) NULL COMMENT '配送员联系方式',
  `estimate_pick_time` TIMESTAMP NULL COMMENT '预计取件时间',
  `estimate_arrival_time` TIMESTAMP NULL COMMENT '预计送达时间',
  `actual_pick_time` TIMESTAMP NULL COMMENT '实际取件时间',
  `delivered_time` TIMESTAMP NULL COMMENT '送达完成时间',
  `fail_reason` VARCHAR(255) NULL COMMENT '失败原因',
  `cancel_reason` VARCHAR(255) NULL COMMENT '取消原因',
  `remark` VARCHAR(255) NULL COMMENT '备注',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_order_status` (`order_id`, `status`),
  INDEX `idx_tracking_no` (`tracking_no`),
  INDEX `idx_created_time` (`created_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单配送记录表';

-- 订单支付流水表
DROP TABLE IF EXISTS `order_pay_records`;
CREATE TABLE `order_pay_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `channel` VARCHAR(20) NOT NULL COMMENT '支付通道: WECHAT_PAY 等',
  `trade_no` VARCHAR(64) NULL COMMENT '第三方支付单号',
  `request_amount` DECIMAL(10,2) NOT NULL COMMENT '请求支付金额(元,2位小数)',
  `status` VARCHAR(20) NOT NULL DEFAULT 'INIT' COMMENT '状态: INIT, PAYING, SUCCESS, FAIL',
  `request_payload` JSON NULL COMMENT '请求报文(JSON)',
  `response_payload` JSON NULL COMMENT '回调/响应报文(JSON)',
  `error_code` VARCHAR(64) NULL COMMENT '错误码',
  `error_message` VARCHAR(255) NULL COMMENT '错误信息',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_order_status` (`order_id`, `status`),
  INDEX `idx_trade_no` (`trade_no`),
  INDEX `idx_channel_status` (`channel`, `status`),
  INDEX `idx_created_time` (`created_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单支付流水表';

-- 订单取消日志表
DROP TABLE IF EXISTS `order_cancel_logs`;
CREATE TABLE `order_cancel_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `canceled_by` BIGINT UNSIGNED NULL COMMENT '取消发起人ID(用户或管理员)',
  `cancel_reason` VARCHAR(255) NULL COMMENT '取消原因',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间(即取消时间)',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_order_id` (`order_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单取消日志表';

-- 订单核销日志表
DROP TABLE IF EXISTS `order_verify_logs`;
CREATE TABLE `order_verify_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `verifier_id` BIGINT UNSIGNED NULL COMMENT '核销人ID(商家/店员)',
  `verify_code` VARCHAR(10) NULL COMMENT '核销码',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间(核销时间)',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_order_id` (`order_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单核销日志表';

-- 订单退款申请/审核表
DROP TABLE IF EXISTS `order_refund_applies`;
CREATE TABLE `order_refund_applies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `refund_no` VARCHAR(32) NOT NULL COMMENT '退款单号',
  `refund_type` VARCHAR(20) NULL COMMENT '退款类型: FULL, PARTIAL',
  `apply_user_id` BIGINT UNSIGNED NULL COMMENT '申请人用户ID',
  `apply_reason` VARCHAR(255) NULL COMMENT '申请原因',
  `apply_amount` DECIMAL(10,2) NOT NULL COMMENT '申请退款金额(元,2位小数)',
  `status` VARCHAR(20) NOT NULL DEFAULT 'APPLIED' COMMENT '状态: APPLIED(已申请), APPROVED(已通过), REJECTED(已拒绝), REFUNDED(已退款)',
  `audit_by` BIGINT UNSIGNED NULL COMMENT '审核人ID(平台/客服)',
  `audit_remark` VARCHAR(255) NULL COMMENT '审核备注',
  `audit_time` TIMESTAMP NULL COMMENT '审核时间',
  `refund_trade_no` VARCHAR(64) NULL COMMENT '第三方退款单号',
  `refund_time` TIMESTAMP NULL COMMENT '退款完成时间',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间(申请时间)',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_refund_no` (`refund_no`),
  INDEX `idx_order_status` (`order_id`, `status`),
  INDEX `idx_apply_user_status` (`apply_user_id`, `status`),
  INDEX `idx_audit_time` (`audit_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单退款申请/审核表';

-- 订单退款明细表（按商品项退款）
DROP TABLE IF EXISTS `order_refund_items`;
CREATE TABLE `order_refund_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `refund_apply_id` BIGINT UNSIGNED NOT NULL COMMENT '关联的退款申请ID',
  `order_item_id` BIGINT UNSIGNED NOT NULL COMMENT '被退款的订单明细ID',
  `refund_amount` DECIMAL(10,2) NOT NULL COMMENT '明细退款金额(元,2位小数)',
  `refund_quantity` INT NOT NULL DEFAULT 0 COMMENT '退款数量',
  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_refund_apply_id` (`refund_apply_id`),
  INDEX `idx_order_item_id` (`order_item_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单退款明细表';

-- 订单取消申请表
DROP TABLE IF EXISTS `order_cancel_applies`;
CREATE TABLE `order_cancel_applies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `cancel_no` VARCHAR(32) NOT NULL COMMENT '取消申请单号',
  `apply_user_id` BIGINT UNSIGNED NOT NULL COMMENT '申请人用户ID',
  `cancel_reason` VARCHAR(500) NULL COMMENT '取消原因',
  `cancel_type` VARCHAR(20) NOT NULL DEFAULT 'USER' COMMENT '取消类型: USER-用户取消; MERCHANT-商家取消; SYSTEM-系统取消',
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING-待审核; APPROVED-已通过; REJECTED-已拒绝; CANCELLED-已取消',
  `apply_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
  `audit_by` BIGINT UNSIGNED NULL COMMENT '审核人ID',
  `audit_remark` VARCHAR(500) NULL COMMENT '审核备注',
  `audit_time` TIMESTAMP NULL COMMENT '审核时间',
  `auto_approved_time` TIMESTAMP NULL COMMENT '自动通过时间',
  `refund_amount` DECIMAL(10,2) NULL COMMENT '退款金额(元,2位小数)',
  `refund_trade_no` VARCHAR(64) NULL COMMENT '第三方退款单号',
  `refund_time` TIMESTAMP NULL COMMENT '退款完成时间',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_cancel_no` (`cancel_no`),
  INDEX `idx_order_status` (`order_id`, `status`),
  INDEX `idx_apply_user_status` (`apply_user_id`, `status`),
  INDEX `idx_apply_time` (`apply_time`),
  INDEX `idx_audit_time` (`audit_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单取消申请表';

-- 区域代理佣金流水表
DROP TABLE IF EXISTS `regional_agent_commission_logs`;
CREATE TABLE `regional_agent_commission_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `agent_user_id` BIGINT UNSIGNED NOT NULL COMMENT '代理用户ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `store_id` BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  `commission_amount` DECIMAL(10,2) NOT NULL COMMENT '佣金金额(元,2位小数)',
  `commission_rate` DECIMAL(5,4) NOT NULL DEFAULT 0 COMMENT '佣金比例(0-1)',
  `status` VARCHAR(20) NOT NULL DEFAULT 'ESTIMATED' COMMENT 'ESTIMATED(预估), CONFIRMED(已确认), PAID(已结算)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_agent_time` (`agent_user_id`, `created_time`),
  INDEX `idx_order` (`order_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '区域代理佣金流水表';

-- 区域代理钱包表
DROP TABLE IF EXISTS `agent_wallets`;
CREATE TABLE `agent_wallets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `agent_user_id` BIGINT UNSIGNED NOT NULL COMMENT '代理用户ID',
  `total_commission` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计佣金(分)',
  `withdrawable_commission` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '可提现佣金(分)',
  `frozen_commission` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '冻结佣金(分)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_agent` (`agent_user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '区域代理钱包表';

-- 联合营销 - 活动主表
DROP TABLE IF EXISTS `joint_campaigns`;
CREATE TABLE `joint_campaigns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` VARCHAR(100) NOT NULL COMMENT '活动名称',
  `description` VARCHAR(500) NULL COMMENT '活动描述',
  `start_time` TIMESTAMP NOT NULL COMMENT '开始时间',
  `end_time` TIMESTAMP NOT NULL COMMENT '结束时间',
  `status` VARCHAR(20) NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED/ONGOING/ENDED',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_status_time` (`status`, `start_time`, `end_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销-活动主表';

-- 联合营销 - 活动参与方表
DROP TABLE IF EXISTS `joint_campaign_participants`;
CREATE TABLE `joint_campaign_participants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `campaign_id` BIGINT UNSIGNED NOT NULL COMMENT '活动ID',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NULL COMMENT '门店ID(可选)',
  `coupon_template_id` BIGINT UNSIGNED NULL COMMENT '关联优惠券模板(可选)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_campaign` (`campaign_id`),
  INDEX `idx_merchant` (`merchant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销-活动参与方表';

-- 趣味营销 - 抽奖记录表
DROP TABLE IF EXISTS `lottery_draw_logs`;
CREATE TABLE `lottery_draw_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `activity_id` BIGINT UNSIGNED NULL COMMENT '活动ID(可选)',
  `prize_id` BIGINT UNSIGNED NULL COMMENT '奖品ID(可选)',
  `prize_type` VARCHAR(20) NOT NULL COMMENT 'POINTS/COUPON/THANK_YOU',
  `cost_points` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '本次消耗积分',
  `status` VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' COMMENT 'SUCCESS/FAILED',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_user_time` (`user_id`, `created_time`),
  INDEX `idx_activity` (`activity_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '趣味营销-用户抽奖日志表';

-- 趣味营销 - 用户签到日志表
DROP TABLE IF EXISTS `user_check_in_logs`;
CREATE TABLE `user_check_in_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `check_in_date` DATE NOT NULL COMMENT '签到日期',
  `continuous_days` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '连续签到天数',
  `reward_points` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当日奖励积分',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_user_date` (`user_id`, `check_in_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '趣味营销-用户签到日志表';

-- 平台配置 - 积分规则
DROP TABLE IF EXISTS `points_rules`;
CREATE TABLE `points_rules`
(
    `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `rule_name`         VARCHAR(50)  NOT NULL COMMENT '规则名称',
    `description`       VARCHAR(255) NOT NULL COMMENT '规则描述',
    `apply_scope`       VARCHAR(20)  NOT NULL COMMENT '规则适用范围: GLOBAL-全平台; MERCHANT-商家; PRODUCT-商品',
    `change_type`       VARCHAR(20)  NOT NULL COMMENT '积分操作: ADD-增加; DED-减少',
    `rule_type`        VARCHAR(20)  NOT NULL COMMENT '规则类型: ORDER_EARN-消费得; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; ORDER_SPEND-下单抵扣; MALL_REDEEM-商城兑换; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; EXPIRED_DEDUCT-过期扣除; OTHERS-其他',
    `once_max_point`    INT                   DEFAULT 0 COMMENT '单次变动最大积分(0为不限)',
    `fixed_points`      INT                   DEFAULT 0 COMMENT '固定变动积分值(简单规则适用, 为0表示复杂规则生效)',
    `fixed_expire`      INT                   DEFAULT 0 COMMENT '固定有效期天数(简单规则适用, 为0表示复杂规则生效, -1表示用不过期)',
    `extra_rules`       JSON NULL COMMENT '复杂规则(JSON数组)',
    `active_time`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '规则生效时间',
    `expire_time`       TIMESTAMP    NOT NULL COMMENT '规则失效时间',
    `sort_weight`       INT                   DEFAULT 1 COMMENT '排序权重(越小越靠前)',
    `is_primary`        TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否该类型默认规则',
    `is_enable`         TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用该规则',

    `created_by`        BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`        BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`        TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`      TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`),
    INDEX               `idx_enable` (`is_enable`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '平台配置-积分规则';

-- 平台配置 - 行业分账比例
DROP TABLE IF EXISTS `ledger_industry_ratios`;
CREATE TABLE `ledger_industry_ratios` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `industry_code` VARCHAR(64) NOT NULL COMMENT '行业编码，如 CAFE, RESTAURANT，或 * 表示默认',
  `ratio` DECIMAL(5,4) NOT NULL DEFAULT 0 COMMENT '平台抽成比例(0-1)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_industry` (`industry_code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '平台配置-行业分账比例';


-- 区域代理提现申请/审核/打款表
DROP TABLE IF EXISTS `agent_withdrawals`;
CREATE TABLE `agent_withdrawals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `agent_user_id` BIGINT UNSIGNED NOT NULL COMMENT '代理用户ID',
  `apply_amount` INT UNSIGNED NOT NULL COMMENT '申请提现金额(分)',
  `status` VARCHAR(20) NOT NULL DEFAULT 'APPLIED' COMMENT 'APPLIED, APPROVED, REJECTED, PAID',
  `audit_by` BIGINT UNSIGNED NULL COMMENT '审核人ID',
  `audit_remark` VARCHAR(255) NULL COMMENT '审核备注',
  `audit_time` TIMESTAMP NULL COMMENT '审核时间',
  `payout_channel` VARCHAR(32) NULL COMMENT '打款渠道: WECHAT, BANK 等',
  `payout_trade_no` VARCHAR(64) NULL COMMENT '打款单号/流水号',
  `payout_time` TIMESTAMP NULL COMMENT '打款完成时间',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_agent_status_time` (`agent_user_id`, `status`, `created_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '区域代理提现表';

-- 积分商城发货记录表（物流对接）
DROP TABLE IF EXISTS `mall_shipments`;
CREATE TABLE `mall_shipments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `mall_order_id` BIGINT UNSIGNED NOT NULL COMMENT '积分商城订单ID',
  `carrier` VARCHAR(64) NULL COMMENT '快递公司编码/名称',
  `tracking_no` VARCHAR(100) NULL COMMENT '运单号',
  `shipped_time` TIMESTAMP NULL COMMENT '发货时间',
  `delivered_time` TIMESTAMP NULL COMMENT '签收时间',
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, SHIPPED, DELIVERED',
  `remark` VARCHAR(255) NULL COMMENT '备注',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分商城发货记录表';

-- 区域代理钱包流水表（对账）
DROP TABLE IF EXISTS `agent_wallet_flows`;
CREATE TABLE `agent_wallet_flows` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `agent_user_id` BIGINT UNSIGNED NOT NULL COMMENT '代理用户ID',
  `type` VARCHAR(30) NOT NULL COMMENT '类型: COMMISSION_CONFIRM, WITHDRAW_APPLY, WITHDRAW_PAID, ADJUST',
  `amount` INT NOT NULL COMMENT '变动金额(分)，正为增加，负为减少',
  `biz_id` VARCHAR(64) NOT NULL COMMENT '幂等ID/业务ID，如订单ID或提现ID',
  `remark` VARCHAR(255) NULL COMMENT '备注',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_biz_id` (`biz_id`),
  INDEX `idx_agent_time` (`agent_user_id`, `created_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '区域代理钱包流水表';

-- 优惠券模板表 (已根据MVP文档优化)
DROP TABLE IF EXISTS `coupon_templates`;
CREATE TABLE `coupon_templates`
(
    `id`                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `merchant_id`                BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '所属商家ID，0为平台券',
    `scope`                      VARCHAR(20)    NOT NULL DEFAULT 'MERCHANT_OWN' COMMENT '适用范围: GLOBAL-全平台; MERCHANT_OWN-商家自身; STORE-门店',
    `sort_order`                 INT UNSIGNED DEFAULT 0 COMMENT '优惠券权重排序(由平台管理, 权重与值成正比)',
    `applicable_stores`          JSON NULL COMMENT '适用门店ID列表',
    `applicable_skus`            JSON NULL COMMENT '适用SKU白名单',
    `type`                       VARCHAR(20)    NOT NULL COMMENT '券类型: CASH-满减/代金; DISCOUNT-折扣',
    `name`                       VARCHAR(50)    NOT NULL COMMENT '模板名称',
    `summary`                    VARCHAR(50)    NOT NULL COMMENT '优惠券简介',
    `logo_url`                   VARCHAR(100)            DEFAULT NULL COMMENT '优惠券logoURL',
    `description`                VARCHAR(1024) NULL COMMENT '优惠券描述',
    `discount_amount`            DECIMAL(10, 2)          DEFAULT 0 COMMENT '优惠金额(元,2位小数)，type=CASH时有效',
    `discount_rate`              DECIMAL(3, 2)           DEFAULT 0 COMMENT '折扣率(0.00-1.00), 如0.85代表85折, type=DISCOUNT时有效',
    `min_spend_amount`           DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '最低消费门槛(元, 2位小数)',
    `max_deductible_amount`      DECIMAL(10, 2) DEFAULT NULL COMMENT '最高可抵扣金额(元, 2位小数, 用于券类型为折扣率时指定)',
    `total_quantity`             INT            NOT NULL DEFAULT -1 COMMENT '发放总量，-1为不限量',
    `issued_quantity`            INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已发放数量',
    `receive_limit_per_merchant` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '每位商家限领数量',
    `receive_limit_per_user`     INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '每位用户限领数量',
    `validity_type`              VARCHAR(20)    NOT NULL COMMENT '有效期类型: FIXED_DATE_RANGE-固定范围; DYNAMIC_DAYS-领取后生效',
    `valid_start_time`           TIMESTAMP NULL COMMENT '固定范围有效期-开始时间',
    `valid_end_time`             TIMESTAMP NULL COMMENT '固定范围有效期-结束时间',
    `valid_days_from_receive`    INT NULL COMMENT '领取后生效-有效天数',
    `coupon_status`              VARCHAR(20)    NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING-待审核; ACTIVE-生效; REJECTED-拒绝; ALL_CLAIMED-被领完; CANCEL-作废',
    `audit_remark`               VARCHAR(50) NULL COMMENT '审核意见',
    `audit_time`                 TIMESTAMP NULL COMMENT '审核时间',
    `audit_by`                   BIGINT UNSIGNED NULL COMMENT '审核人ID',
    `is_enable`                  TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否被平台启用: true-启用; false-禁用',
    `version`                    INT            NOT NULL DEFAULT 0 COMMENT '版本号(乐观锁)',

    `created_by`                 BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`               TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`                 BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`               TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`                 TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`               TIMESTAMP NULL COMMENT '删除时间(软删除)'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '优惠券模板表';

-- 用户优惠券表
DROP TABLE IF EXISTS `user_coupons`;
CREATE TABLE `user_coupons`
(
    `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `coupon_code`       VARCHAR(32) NOT NULL COMMENT '优惠券码',
    `user_id`           BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    `template_id`       BIGINT UNSIGNED NOT NULL COMMENT '优惠券模板ID',
    `issue_merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '优惠券发放商家ID',
    `source_type`       VARCHAR(50) NULL COMMENT '来源类型: JOINT_MARKETING 等',
    `source_id`         BIGINT UNSIGNED NULL COMMENT '来源ID (如规则ID)',
    `coupon_status`     VARCHAR(20) NOT NULL DEFAULT 'UNUSED' COMMENT '券状态: UNUSED-未用; LOCKED-锁定; USED-已用; EXPIRED-过期; REFUNDED-已退款失效; INVALID-已作废',
    `valid_start_time`  TIMESTAMP   NOT NULL COMMENT '券生效时间',
    `valid_end_time`    TIMESTAMP   NOT NULL COMMENT '券失效时间',
    `used_order_id`     BIGINT UNSIGNED NULL COMMENT '使用该券的订单ID',
    `refund_order_id`   BIGINT UNSIGNED NULL COMMENT '关联退款单ID',

    `created_by`        BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`        BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`        TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`      TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '用户持有的优惠券';

-- 优惠券核销记录表
DROP TABLE IF EXISTS `coupon_redeem_logs`;
CREATE TABLE `coupon_redeem_logs`
(
    `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `user_id`           BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    `user_coupon_id`    BIGINT UNSIGNED NOT NULL COMMENT '用户优惠券ID(关联user_coupons.id)',
    `template_id`       BIGINT UNSIGNED NOT NULL COMMENT '优惠券模板ID(关联coupon_templates.id)',
    `merchant_id`       BIGINT UNSIGNED NOT NULL COMMENT '核销商家ID',
    `issue_merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '优惠券原始发放商家ID',
    `used_order_id`     BIGINT UNSIGNED NOT NULL COMMENT '关联的订单ID, 到店核销为0',
    `redeem_amount`     DECIMAL(10, 2) NOT NULL COMMENT '核销抵扣金额',
    `redeem_time`       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '核销时间',

    `created_by`        BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`        BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`        TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`      TIMESTAMP NULL COMMENT '删除时间(软删除)',

    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_coupon_id` (`user_coupon_id`),
    KEY                 `idx_template_id` (`template_id`),
    KEY                 `idx_merchant_time` (`merchant_id`, `redeem_time`),
    KEY                 `idx_issue_merchant_time` (`issue_merchant_id`, `redeem_time`),
    KEY                 `idx_user_time` (`user_id`, `redeem_time`),
    KEY                 `idx_redeem_time` (`redeem_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='优惠券核销记录表';

-- 系统配置表
DROP TABLE IF EXISTS `system_configs`;
CREATE TABLE `system_configs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `config_key` VARCHAR(100) NOT NULL COMMENT '配置键',
  `config_value` VARCHAR(512) NOT NULL COMMENT '配置值',
  `description` VARCHAR(255) NULL COMMENT '配置说明',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_config_key` (`config_key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '系统全局配置表';

-- 小程序首页轮播图表
DROP TABLE IF EXISTS `mini_banner`;
CREATE TABLE `mini_banner`
(
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `image_name`      VARCHAR(30)  NOT NULL COMMENT '轮播图名称',
    `summary`         VARCHAR(50) DEFAULT NULL COMMENT '轮播图摘要',
    `target_type`     VARCHAR(20)  NOT NULL COMMENT '目标类型: NOTICE-公告; COUPON-优惠券; PRODUCT-商品; STORE-门店; MERCHANT-商家; INDUSTRY-行业',
    `target_id`       BIGINT UNSIGNED NOT NULL COMMENT '目标ID(如公告ID, 商品ID, 商家ID等)',
    `route_path`      VARCHAR(255) NOT NULL COMMENT '跳转路径',
    `image_url`       VARCHAR(255) NOT NULL COMMENT '轮播图URL',
    `sort_weight`     INT          NOT NULL DEFAULT 0 COMMENT '排序权重(值与权重成正比)',
    `bg_color`        VARCHAR(30)  NOT NULL COMMENT '背景颜色',
    `show_start_time` TIMESTAMP             DEFAULT NULL COMMENT '展示开始时间',
    `show_end_time`   TIMESTAMP             DEFAULT NULL COMMENT '展示结束时间',
    `is_enable`       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用',

    `created_by`      BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`      BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`    TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '小程序首页轮播图表';

-- 小程序导航栏菜单表
DROP TABLE IF EXISTS `navigation_menu`;
CREATE TABLE `navigation_menu`
(
    `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `name`         VARCHAR(20) NOT NULL COMMENT '菜单名称',
    `merchant_id`  BIGINT UNSIGNED DEFAULT 0 COMMENT '商家ID(0表示平台)',
    `target_id`    BIGINT UNSIGNED DEFAULT 0 COMMENT '目标ID(如商品分类ID, 行业分类ID)',
    `parent_id`    BIGINT UNSIGNED DEFAULT 0 COMMENT '父菜单ID',
    `depth`        INT                  DEFAULT 0 COMMENT '菜单深度(0为顶部菜单)',
    `type`         VARCHAR(20) NOT NULL COMMENT '菜单类型: TOP-顶部; SIDE-侧边; MID-中间',
    `image_url`    VARCHAR(100) NULL COMMENT '图标URL',
    `sort_weight`  INT                  DEFAULT 0 COMMENT '排序权重(值与权重成正比)',
    `is_enable`    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用',

    `created_by`   BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`   BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '小程序导航栏菜单表';

-- ----------------------------
-- Part 2: 二期阶段核心表
-- ----------------------------

-- 积分商城商品分类表
DROP TABLE IF EXISTS `points_mall_categories`;
CREATE TABLE `points_mall_categories`
(
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `depth`           INT DEFAULT 1 COMMENT '层级深度',
    `parent_id`       BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父分类ID(支持多级分类)',
    `name`            VARCHAR(50) NOT NULL COMMENT '分类名称',
    `icon`            VARCHAR(100) NULL COMMENT '分类图标URL',
    `banner_image`    VARCHAR(100) NULL COMMENT '分类横幅图URL',
    `description`     VARCHAR(255) NULL COMMENT '分类描述',
    `sort_order`      INT         NOT NULL DEFAULT 0 COMMENT '排序序号, 越小越靠前',
    `target_audience` JSON NULL COMMENT '目标用户群体配置(JSON): {"min_level": 1, "max_level": 5, "user_type": ["NEW_USER", "VIP"]}',
    `is_hot`          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否热门分类',
    `is_recommend`    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否推荐分类',
    `is_enable`       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '启用状态',
    `product_count`   INT UNSIGNED DEFAULT 0 COMMENT '分类下商品数量(冗余字段)',

    `created_by`      BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`      BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`    TIMESTAMP NULL COMMENT '删除时间(软删除)',

    PRIMARY KEY (`id`),
    INDEX             `idx_parent_id` (`parent_id`),
    INDEX             `idx_sort_order` (`sort_order`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分商城分类表';

-- 积分商城商品表
DROP TABLE IF EXISTS `points_mall_products`;
CREATE TABLE `points_mall_products`
(
    `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `category_id`    BIGINT UNSIGNED NOT NULL COMMENT '商品分类ID',
    `name`           VARCHAR(255) NOT NULL COMMENT '商品名称',
    `type`           VARCHAR(20)  NOT NULL COMMENT '商品类型: VIRTUAL_COUPON(虚拟券), PHYSICAL_GOOD(实物)',
    `main_image`     VARCHAR(200) NOT NULL COMMENT '商品主图URL',
    `image`          JSON NULL COMMENT '商品图片URL列表(JSON)',
    `description`    TEXT NULL COMMENT '商品描述',
    `points_cost`    INT UNSIGNED NOT NULL COMMENT '兑换所需积分(整数)',
    `cash_price`     DECIMAL(10, 2)        DEFAULT 0.0 COMMENT '可选售价金额(元,2位小数)',
    `stock`          INT          NOT NULL DEFAULT -1 COMMENT '库存, -1为无限库存',
    `exchange_count` INT          NOT NULL DEFAULT 0 COMMENT '已兑换数量',
    `coupon_id`      BIGINT UNSIGNED NULL COMMENT '关联的优惠券模板ID(虚拟券类)',
    `on_shelf`       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否上架',
    `status`         VARCHAR(20)  NOT NULL DEFAULT 'OFF_SHELF' COMMENT '商品状态: ON_SHELF-已上架, OFF_SHELF-已下架, OUT_OF_STOCK-已售罄, PENDING_ON_SHELF-待上架',
    `order_sort`     INT          NOT NULL DEFAULT 0 COMMENT '排序权重, 越小越靠前',
    `version`        INT          NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',

    `created_by`     BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`     BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`     TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`   TIMESTAMP NULL COMMENT '删除时间(软删除)',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分商城商品表';

-- 积分兑换规则表
DROP TABLE IF EXISTS `points_exchange_rules`;
CREATE TABLE `points_exchange_rules`
(
    `id`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `rule_name`               VARCHAR(100) NOT NULL COMMENT '规则名称',
    `description`             VARCHAR(255) NULL COMMENT '规则描述',
    -- 规则适用范围
    `apply_scope`             VARCHAR(20)  NOT NULL DEFAULT 'GLOBAL' COMMENT '适用范围: GLOBAL-全平台; CATEGORY-分类; PRODUCT-商品; USER_LEVEL-用户等级',
    `scope_id`                BIGINT UNSIGNED NULL COMMENT '适用范围ID(分类ID/商品ID/用户等级ID)',
    -- 兑换条件控制
    `user_level_restriction`  JSON NULL COMMENT '用户等级限制: {"min_level": 1, "max_level": 5, "exclude_levels": []}',
    `points_range`            JSON NULL COMMENT '积分范围限制: {"min_points": 100, "max_points": 10000}',
    `exchange_limit_type`     VARCHAR(20)  NOT NULL DEFAULT 'NONE' COMMENT '兑换限制类型: NONE-无限制; DAILY-每日; WEEKLY-每周; MONTHLY-每月; TOTAL-总次数',
    `exchange_limit_value`    INT UNSIGNED DEFAULT 0 COMMENT '兑换限制值',
    `start_time`              TIMESTAMP NULL COMMENT '规则生效开始时间',
    `end_time`                TIMESTAMP NULL COMMENT '规则生效结束时间',
    -- 积分计算规则
    `points_calculation_type` VARCHAR(20)  NOT NULL DEFAULT 'FIXED' COMMENT '积分计算类型: FIXED-固定积分; DISCOUNT-折扣; DYNAMIC-动态计算',
    `base_points`             INT UNSIGNED DEFAULT 0 COMMENT '基础积分值',
    `discount_rate`           DECIMAL(5, 4) NULL COMMENT '折扣率(0.85表示85折)',
    `calculation_formula`     VARCHAR(500) NULL COMMENT '动态计算公式',
    -- 运营属性
    `priority`                INT          NOT NULL DEFAULT 0 COMMENT '优先级(数值越小优先级越高)',
    `is_enable`               TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    `rule_tags`               JSON NULL COMMENT '规则标签: ["新人专享", "限时活动", "会员专属"]',
    -- 审计字段
    `created_by`              BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`              BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`              TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`            TIMESTAMP NULL COMMENT '删除时间(软删除)',

    PRIMARY KEY (`id`),
    INDEX                     `idx_apply_scope` (`apply_scope`, `scope_id`),
    INDEX                     `idx_time_range` (`start_time`, `end_time`),
    INDEX                     `idx_priority` (`priority`),
    INDEX                     `idx_enable` (`is_enable`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分兑换规则表';

-- 积分商城购物车表
DROP TABLE IF EXISTS `points_mall_cart`;
CREATE TABLE `points_mall_cart`
(
    `id`               BIGINT    NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `user_id`          BIGINT    NOT NULL COMMENT '用户ID',
    `product_id`       BIGINT    NOT NULL COMMENT '商品ID',
    `product_snapshot` JSON               DEFAULT NULL COMMENT '商品快照',
    `quantity`         INT       NOT NULL DEFAULT 1 COMMENT '选购数量',
    `status`           TINYINT   NOT NULL DEFAULT 1 COMMENT '状态：1=有效, 0=失效(商品下架/删除时标记)',
    `invalid_reason`   VARCHAR(10)        DEFAULT NULL COMMENT '失效原因: OFFLINE-商品下架; DELETED-商品删除;',
    `version`          INT       NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    -- 审计字段
    `created_by`       BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by`       BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted`       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time`     TIMESTAMP NULL COMMENT '删除时间(软删除)',

    -- 索引设计
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_product` (`user_id`, `product_id`) COMMENT '确保同一用户同一商品仅存一条记录',
    KEY                `idx_user_status` (`user_id`, `status`) COMMENT '高效查询用户有效购物车项',
    KEY                `idx_product_id` (`product_id`) COMMENT '商品状态变更时批量更新购物车状态',

    -- 业务约束
    CONSTRAINT `chk_quantity_positive` CHECK (`quantity` > 0),
    CONSTRAINT `chk_status_enum` CHECK (`status` IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分商城购物车表（含商品快照，支持软删除商品追溯）';

-- 积分商城订单表
DROP TABLE IF EXISTS `points_mall_orders`;
CREATE TABLE `points_mall_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `rule_id` BIGINT UNSIGNED NULL COMMENT '应用的积分兑换规则ID',
  `mall_product_id` BIGINT UNSIGNED NOT NULL COMMENT '积分商城商品ID',
  `exchange_points` INT UNSIGNED NOT NULL COMMENT '兑换消耗积分(冗余)',
  `order_status` VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' COMMENT '订单状态: COMPLETED(完成), PENDING_SHIPPING(待发货), SHIPPED(已发货)',
  `shipping_info` JSON NULL COMMENT '收货信息(JSON，实物商品时使用)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '积分商城兑换订单表';

-- 拼团活动定义表
DROP TABLE IF EXISTS `group_buy_activities`;
CREATE TABLE `group_buy_activities` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `sku_id` BIGINT UNSIGNED NOT NULL COMMENT '参与拼团的SKU ID',
  `group_price` INT UNSIGNED NOT NULL COMMENT '拼团价(分)',
  `group_size` INT UNSIGNED NOT NULL COMMENT '成团人数',
  `duration_hours` INT UNSIGNED NOT NULL COMMENT '成团时限(小时)',
  `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '活动状态',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '拼团活动定义表';

-- 用户拼团主记录表
DROP TABLE IF EXISTS `user_group_buys`;
CREATE TABLE `user_group_buys` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `activity_id` BIGINT UNSIGNED NOT NULL COMMENT '拼团活动ID',
  `initiator_id` BIGINT UNSIGNED NOT NULL COMMENT '团长用户ID',
  `status` VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' COMMENT '拼团状态: IN_PROGRESS(进行中), SUCCESS(成功), FAILED(失败)',
  `expires_time` TIMESTAMP NOT NULL COMMENT '成团截止时间',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '用户拼团主记录表';

-- 拼团参与成员表
DROP TABLE IF EXISTS `group_buy_members`;
CREATE TABLE `group_buy_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `group_buy_id` BIGINT UNSIGNED NOT NULL COMMENT '拼团主记录ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '参与用户ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '关联订单ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_group_user` (`group_buy_id`, `user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '拼团参与成员表';

-- 分销关系表
DROP TABLE IF EXISTS `distribution_relations`;
CREATE TABLE `distribution_relations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `parent_id` BIGINT UNSIGNED NOT NULL COMMENT '上级用户ID',
  `level` TINYINT NOT NULL COMMENT '相对于parent_id的层级, 1表示直接下级',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_user_parent` (`user_id`, `parent_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '用户分销关系链表';

-- 分销佣金流水表
DROP TABLE IF EXISTS `distribution_ledgers`;
CREATE TABLE `distribution_ledgers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '佣金受益人ID',
  `source_order_id` BIGINT UNSIGNED NOT NULL COMMENT '产生佣金的订单ID',
  `source_user_id` BIGINT UNSIGNED NOT NULL COMMENT '下单用户ID',
  `commission_amount` DECIMAL(10,2) NOT NULL COMMENT '佣金金额(元,2位小数)',
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_SETTLEMENT' COMMENT '结算状态: PENDING_SETTLEMENT 待结算 等',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '分销佣金流水表';

-- 盲盒活动表
DROP TABLE IF EXISTS `blind_box_activities`;
CREATE TABLE `blind_box_activities` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` VARCHAR(255) NOT NULL COMMENT '活动名称',
  `cost_points` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '参与所需积分',
  `start_time` TIMESTAMP NULL COMMENT '开始时间',
  `end_time` TIMESTAMP NULL COMMENT '结束时间',
  `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '活动状态',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '盲盒活动表';

-- 盲盒奖品池
DROP TABLE IF EXISTS `blind_box_prize_pools`;
CREATE TABLE `blind_box_prizes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `activity_id` BIGINT UNSIGNED NOT NULL COMMENT '活动ID',
  `prize_name` VARCHAR(255) NOT NULL COMMENT '奖品名称',
  `prize_type` VARCHAR(20) NOT NULL DEFAULT 'COUPON' COMMENT '奖品类型，默认COUPON',
  `related_coupon_template_id` BIGINT UNSIGNED NOT NULL COMMENT '关联的优惠券模板ID',
  `probability` INT NOT NULL COMMENT '中奖权重/概率，如 1-10000',
  `stock` INT NOT NULL DEFAULT -1 COMMENT '库存，-1为无限库存',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '盲盒奖品池';

-- 区域代理信息表
DROP TABLE IF EXISTS `agent_regions`;
CREATE TABLE `agents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` VARCHAR(255) NOT NULL COMMENT '代理名称',
  `contact_info` VARCHAR(255) NOT NULL COMMENT '联系方式',
  `responsible_region_code` VARCHAR(50) NOT NULL COMMENT '负责区域代码',
  `commission_rate` DECIMAL(5, 4) NOT NULL COMMENT '分润比例, 例如 0.005',
  `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '代理状态',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '区域代理信息表';

-- 代理佣金流水表
DROP TABLE IF EXISTS `agent_ledgers`;
CREATE TABLE `agent_ledgers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT '代理ID',
  `source_order_id` BIGINT UNSIGNED NOT NULL COMMENT '产生佣金的订单ID',
  `commission_amount` DECIMAL(10,2) NOT NULL COMMENT '佣金金额(元,2位小数)',
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING_SETTLEMENT' COMMENT '结算状态',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '代理佣金流水表';

-- 客服工单主表
DROP TABLE IF EXISTS `cs_tickets`;
CREATE TABLE `cs_tickets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `title` VARCHAR(255) NOT NULL COMMENT '工单标题',
  `category` VARCHAR(50) NOT NULL COMMENT '问题分类，如: ORDER_ISSUE, ACCOUNT_PROBLEM',
  `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN' COMMENT '工单状态: OPEN, IN_PROGRESS, RESOLVED, CLOSED',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_user_status` (`user_id`, `status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '客服工单主表';

-- 客服工单消息表
DROP TABLE IF EXISTS `cs_ticket_messages`;
CREATE TABLE `cs_ticket_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `ticket_id` BIGINT UNSIGNED NOT NULL COMMENT '工单ID',
  `sender_id` BIGINT UNSIGNED NOT NULL COMMENT '发送者ID(用户ID或管理员ID)',
  `sender_type` VARCHAR(10) NOT NULL COMMENT '发送者类型: USER, ADMIN',
  `content` TEXT NOT NULL COMMENT '消息内容',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_ticket_id` (`ticket_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '客服工单消息表';

-- 订单状态变更日志表（用于追踪订单状态变化）
DROP TABLE IF EXISTS `order_status_logs`;
CREATE TABLE `order_status_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `from_status` VARCHAR(20) NULL COMMENT '原状态',
  `to_status` VARCHAR(20) NOT NULL COMMENT '新状态',
  `operator_id` BIGINT UNSIGNED NULL COMMENT '操作人ID',
  `operator_type` VARCHAR(20) NOT NULL DEFAULT 'USER' COMMENT '操作人类型: USER(用户), MERCHANT(商家), SYSTEM(系统)',
  `remark` VARCHAR(255) NULL COMMENT '状态变更备注',
  
  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  INDEX `idx_order_id` (`order_id`),
  INDEX `idx_status_time` (`to_status`, `created_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '订单状态变更日志表';
-- ----------------------------
-- 服务型订单（到店/服务类订单）
-- 说明：独立结构，避免使用JSON字段；共享用户/优惠券/支付域
-- ----------------------------

-- 服务型订单主表
DROP TABLE IF EXISTS `service_orders`;
CREATE TABLE `service_orders` (
  `id`              BIGINT UNSIGNED NOT NULL COMMENT '主键ID',
  `order_no`        VARCHAR(64)     NOT NULL COMMENT '订单号',
  `merchant_id`     BIGINT UNSIGNED NOT NULL COMMENT '商户ID',
  `store_id`        BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  `user_id`         BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `status`          VARCHAR(32)     NOT NULL DEFAULT 'PENDING_PAYMENT' COMMENT '订单状态: PENDING_PAYMENT, PAID, CANCELLED, COMPLETED, REFUNDING, REFUNDED',
  `total_amount`    DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '订单总金额',
  `pay_amount`      DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '实付金额',
  `user_coupon_id`  BIGINT UNSIGNED NULL COMMENT '共享用户券ID (user_coupons.id)',
  `coupon_deduction` DECIMAL(10,2)  NOT NULL DEFAULT 0.00 COMMENT '优惠券抵扣金额',
  `pay_channel`     VARCHAR(32)     NULL COMMENT '支付渠道标识(共享支付域)',
  `pay_trade_no`    VARCHAR(128)    NULL COMMENT '支付域返回的交易号',
  `verification_code` VARCHAR(64)   NOT NULL COMMENT '订单核销码(到店/服务型)',
  `appointment_id`  BIGINT UNSIGNED NULL COMMENT '预约主键(service_appointments.id)',
  `completed_time`  TIMESTAMP       NULL COMMENT '完成时间',
  `cancelled_time`  TIMESTAMP       NULL COMMENT '取消时间',
  `refunded_time`   TIMESTAMP       NULL COMMENT '退款完成时间',
  `remark`          VARCHAR(255)    NULL COMMENT '备注',
  `create_time`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_service_orders_order_no` (`order_no`),
  INDEX `idx_service_orders_user` (`user_id`),
  INDEX `idx_service_orders_store` (`store_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '服务型订单：订单主体';

-- 服务型订单明细表
DROP TABLE IF EXISTS `service_order_items`;
CREATE TABLE `service_order_items` (
  `id`           BIGINT UNSIGNED NOT NULL COMMENT '主键ID',
  `order_id`     BIGINT UNSIGNED NOT NULL COMMENT '订单ID(service_orders.id)',
  `sku_id`       BIGINT UNSIGNED NOT NULL COMMENT 'SKU ID(product_skus.id)',
  `sku_name`     VARCHAR(128)    NOT NULL COMMENT 'SKU名称',
  `unit_price`   DECIMAL(10,2)   NOT NULL COMMENT '单价',
  `quantity`     INT             NOT NULL DEFAULT 1 COMMENT '数量',
  `total_price`  DECIMAL(10,2)   NOT NULL COMMENT '小计金额',
  `create_time`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_service_order_items_order` (`order_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '服务型订单：明细项';

-- 服务型订单预约信息表
DROP TABLE IF EXISTS `service_appointments`;
CREATE TABLE `service_appointments` (
  `id`               BIGINT UNSIGNED NOT NULL COMMENT '主键ID',
  `order_id`         BIGINT UNSIGNED NOT NULL COMMENT '订单ID(service_orders.id)',
  `user_id`          BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `merchant_id`      BIGINT UNSIGNED NOT NULL COMMENT '商户ID',
  `store_id`         BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  `status`           VARCHAR(32)     NOT NULL DEFAULT 'SCHEDULED' COMMENT '预约状态: PENDING, SCHEDULED, RESCHEDULED, CANCELLED, FULFILLED',
  `start_time`       TIMESTAMP       NOT NULL COMMENT '开始时间',
  `end_time`         TIMESTAMP       NULL COMMENT '结束时间',
  `service_staff_id` BIGINT UNSIGNED NULL COMMENT '指派服务人员ID',
  `notes`            VARCHAR(255)    NULL COMMENT '备注',
  `create_time`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_service_appointments_order` (`order_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '服务型订单：预约信息';

-- 服务型订单核销日志表
DROP TABLE IF EXISTS `service_verification_logs`;
CREATE TABLE `service_verification_logs` (
  `id`                 BIGINT UNSIGNED NOT NULL COMMENT '主键ID',
  `order_id`           BIGINT UNSIGNED NOT NULL COMMENT '订单ID(service_orders.id)',
  `verification_code`  VARCHAR(64)     NOT NULL COMMENT '核销码',
  `method`             VARCHAR(32)     NOT NULL COMMENT '核销方式: CODE, STAFF, BACKOFFICE',
  `verifier_user_id`   BIGINT UNSIGNED NULL COMMENT '核销用户ID',
  `verifier_staff_id`  BIGINT UNSIGNED NULL COMMENT '核销员工ID',
  `verified_time`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '核销时间',
  `remarks`            VARCHAR(255)    NULL COMMENT '备注',
  PRIMARY KEY (`id`),
  INDEX `idx_service_verification_order` (`order_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '服务型订单：核销日志';

-- 服务型订单退款请求表
DROP TABLE IF EXISTS `service_refund_requests`;
CREATE TABLE `service_refund_requests` (
  `id`              BIGINT UNSIGNED NOT NULL COMMENT '主键ID',
  `order_id`        BIGINT UNSIGNED NOT NULL COMMENT '订单ID(service_orders.id)',
  `user_id`         BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `status`          VARCHAR(32)     NOT NULL DEFAULT 'APPLIED' COMMENT '退款状态: APPLIED, APPROVED, REJECTED, CANCELLED, REFUNDED',
  `reason`          VARCHAR(255)    NULL COMMENT '退款原因',
  `amount`          DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '退款金额',
  `applied_time`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
  `audited_time`    TIMESTAMP       NULL COMMENT '审核时间',
  `auditor_user_id` BIGINT UNSIGNED NULL COMMENT '审核人ID',
  PRIMARY KEY (`id`),
  INDEX `idx_service_refund_order` (`order_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '服务型订单：退款请求';

-- ----------------------------
-- Part 4: 评价系统表 (新增)
-- ----------------------------

-- 商品评价表
DROP TABLE IF EXISTS `product_comment`;
CREATE TABLE `product_comment` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `app_user_id` BIGINT UNSIGNED NOT NULL COMMENT '消费者ID (对应 AppUser 表)',
  `user_nick_name` VARCHAR(100) NULL COMMENT '用户昵称 (冗余)',
  `user_avatar` VARCHAR(512) NULL COMMENT '用户头像 (冗余)',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID (品牌/总店维度)',
  `store_id` BIGINT UNSIGNED NOT NULL COMMENT '门店ID (履约/服务维度)',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `order_item_id` BIGINT UNSIGNED NOT NULL COMMENT '订单项ID',
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  `product_name` VARCHAR(255) NULL COMMENT '商品名称 (冗余)',
  `sku_id` BIGINT UNSIGNED NOT NULL COMMENT 'SKU ID',
  `sku_spec` VARCHAR(255) NULL COMMENT '规格描述',
  `star` INT NOT NULL DEFAULT 5 COMMENT '商品评分 (1-5星)',
  `content` TEXT NULL COMMENT '评价内容',
  `images` JSON NULL COMMENT '评价图片 (JSON数组)',
  `is_anonymous` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否匿名 (0-否 1-是)',
  `is_show` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否显示 (1-显示 0-隐藏)',
  `reply_content` TEXT NULL COMMENT '商家回复内容',
  `reply_time` TIMESTAMP NULL COMMENT '商家回复时间',
  `reply_user_id` BIGINT UNSIGNED NULL COMMENT '回复人ID (对应 User 表)',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_order_item` (`order_item_id`),
  INDEX `idx_product` (`product_id`, `is_show`),
  INDEX `idx_store` (`store_id`),
  INDEX `idx_merchant` (`merchant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '商品评价表';

-- 店铺服务评价表
DROP TABLE IF EXISTS `store_service_comment`;
CREATE TABLE `store_service_comment` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
  `app_user_id` BIGINT UNSIGNED NOT NULL COMMENT '消费者ID',
  `delivery_star` INT NOT NULL DEFAULT 5 COMMENT '物流评分 (1-5)',
  `service_star` INT NOT NULL DEFAULT 5 COMMENT '服务态度评分 (1-5)',

  `tenant_id` BIGINT UNSIGNED NULL COMMENT '租户ID',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_order` (`order_id`),
  INDEX `idx_store` (`store_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '店铺服务评价表';
-- ----------------------------
-- 联合营销相关表结构 (Joint Marketing)
-- ----------------------------

-- 1. 联合营销计划表
DROP TABLE IF EXISTS `joint_marketing_plan`;
CREATE TABLE `joint_marketing_plan` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `name` VARCHAR(100) NOT NULL COMMENT '计划名称',
    `description` TEXT NULL COMMENT '计划描述',
    `initiator_merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '发起商家ID',
    `start_time` TIMESTAMP NOT NULL COMMENT '开始时间',
    `end_time` TIMESTAMP NOT NULL COMMENT '结束时间',
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态: DRAFT-草稿; PUBLISHED-进行中; PAUSED-暂停; ENDED-结束',
    `audit_status` VARCHAR(20) DEFAULT 'PENDING' COMMENT '平台审核状态: APPROVED-通过; REJECTED-拒绝',
    `audit_reason` VARCHAR(100) DEFAULT NULL COMMENT '审核备注',
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销计划表';

-- 2. 联合营销参与方表
DROP TABLE IF EXISTS `joint_marketing_participant`;
CREATE TABLE `joint_marketing_participant` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `plan_id` BIGINT UNSIGNED NOT NULL COMMENT '计划ID',
    `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
    `info` VARCHAR(50) NULL COMMENT '邀请/申请信息',
    `role` VARCHAR(20) NOT NULL DEFAULT 'PARTICIPANT' COMMENT '角色: INITIATOR-发起者; PARTICIPANT-参与者',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING-邀请中; APPLY_JOIN-申请加入; ACCEPTED-已接受; REJECTED-已拒绝; QUIT-已退出',
    `expiry_time` TIMESTAMP NULL COMMENT '邀请过期时间',
    `join_time` TIMESTAMP NULL COMMENT '加入时间',
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    INDEX `idx_plan` (`plan_id`),
    UNIQUE INDEX `uk_plan_merchant` (`plan_id`, `merchant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销参与方表';

-- 3. 联合营销规则表
DROP TABLE IF EXISTS `joint_marketing_rule`;
CREATE TABLE `joint_marketing_rule` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `plan_id` BIGINT UNSIGNED NOT NULL COMMENT '计划ID',
    `name` VARCHAR(100) NOT NULL COMMENT '规则名称',
    -- 触发范围配置
    `trigger_merchant_ids` JSON NOT NULL COMMENT '触发商家ID列表',
    `trigger_store_ids` JSON NULL COMMENT '触发门店ID列表(NULL代表所有门店)',
    -- 触发条件配置
    `trigger_event` VARCHAR(30) NOT NULL DEFAULT 'ORDER_COMPLETE' COMMENT '触发事件: ORDER_COMPLETE-订单完成; ORDER_VERIFY-订单核销',
    `min_order_amount` DECIMAL(10,2) DEFAULT 0 COMMENT '最低消费金额',
    `product_scope_type` VARCHAR(20) DEFAULT 'ALL' COMMENT '商品范围: ALL-全部; CATEGORY-指定分类; SPECIFIC-指定商品',
    `product_scope_ids` JSON NULL COMMENT '指定商品/分类ID列表',
    -- 限制配置
    `daily_limit_per_user` INT DEFAULT 1 COMMENT '单用户每日触发上限',
    `total_limit` INT DEFAULT -1 COMMENT '规则总触发上限',
    `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态: ACTIVE-启用; DISABLED-禁用',
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    INDEX `idx_plan` (`plan_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销规则表'; 

-- 4. 联合营销奖励表
DROP TABLE IF EXISTS `joint_marketing_reward`;
CREATE TABLE `joint_marketing_reward` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `rule_id` BIGINT UNSIGNED NOT NULL COMMENT '关联规则ID',
    `provider_merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '券提供方商家ID',
    `reward_type` VARCHAR(20) NOT NULL DEFAULT 'COUPON' COMMENT '奖励类型: COUPON-优惠券',
    `reward_content_id` BIGINT UNSIGNED NOT NULL COMMENT '奖励内容ID(如优惠券模板ID)',
    `reward_quantity` INT DEFAULT 1 COMMENT '发放数量',
    `stock_limit` INT DEFAULT -1 COMMENT '奖励库存限制(-1不限)',
    `issued_count` INT DEFAULT 0 COMMENT '已发放数量',
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    INDEX `idx_rule` (`rule_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销奖励表';

-- 5. 联合营销分润配置表
DROP TABLE IF EXISTS `joint_marketing_allocation`;
CREATE TABLE `joint_marketing_allocation` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `rule_id` BIGINT UNSIGNED NOT NULL COMMENT '关联规则ID',
    `reward_id` BIGINT UNSIGNED NULL COMMENT '关联奖励ID(可选)',
    -- 触发分润的时机
    `trigger_phase` VARCHAR(30) NOT NULL DEFAULT 'COUPON_VERIFY' COMMENT '分润时机: COUPON_ISSUE-发券时; COUPON_VERIFY-核销时',
    -- 谁付钱给谁
    `payer_merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '支付方商家ID',
    `payee_merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '接收方商家ID',
    `payee_role` VARCHAR(20) DEFAULT 'MERCHANT' COMMENT '接收方角色: MERCHANT-商家; PLATFORM-平台',
    -- 分多少
    `allocation_type` VARCHAR(20) NOT NULL DEFAULT 'FIXED' COMMENT '分润类型: FIXED-固定金额; RATE-比例',
    `allocation_value` DECIMAL(10,2) NOT NULL COMMENT '分润值',
    `description` VARCHAR(100) NULL COMMENT '费用说明',
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    INDEX `idx_rule` (`rule_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销分润配置表';

-- 6. 联合营销执行记录表 (Logs)
DROP TABLE IF EXISTS `joint_marketing_log`;
CREATE TABLE `joint_marketing_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `plan_id` BIGINT UNSIGNED NOT NULL,
    `rule_id` BIGINT UNSIGNED NOT NULL,
    `trigger_order_id` BIGINT UNSIGNED NOT NULL COMMENT '触发订单ID',
    `consumer_user_id` BIGINT UNSIGNED NOT NULL,
    `rewards_snapshot` JSON NULL COMMENT '发放奖励快照',
    `allocations_snapshot` JSON NULL COMMENT '预计分润快照',
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    INDEX `idx_order` (`trigger_order_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销执行记录表';

-- 7. 联合营销返利记录表
DROP TABLE IF EXISTS `joint_marketing_rebate_record`;
CREATE TABLE `joint_marketing_rebate_record` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `plan_id` BIGINT UNSIGNED NOT NULL,
    `rule_id` BIGINT UNSIGNED NOT NULL,
    `allocation_id` BIGINT UNSIGNED NOT NULL COMMENT '关联分润配置ID',
    `coupon_id` BIGINT UNSIGNED NOT NULL COMMENT '关联优惠券ID',
    `trigger_order_id` BIGINT UNSIGNED NOT NULL COMMENT '触发发券的订单ID',
    `payer_merchant_id` BIGINT UNSIGNED NOT NULL,
    `payee_merchant_id` BIGINT UNSIGNED NOT NULL,
    `payee_role` VARCHAR(20) NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL COMMENT '返利金额',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态: WAITING_VERIFY-待核销; PENDING_SETTLEMENT-待结算; SETTLED-已结算; CANCELLED-已取消',
    `failure_reason` VARCHAR(255) NULL COMMENT '失败原因',
    `retry_count` INT NOT NULL DEFAULT 0 COMMENT '重试次数',
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    `settled_time` TIMESTAMP NULL COMMENT '结算时间',
    INDEX `idx_coupon` (`coupon_id`),
    INDEX `idx_merchant_status` (`payee_merchant_id`, `status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '联合营销返利记录表';

-- ----------------------------
-- Part 5: 报表模块 (Report Module)
-- ----------------------------

-- 1. 门店经营日报表 (基础报表-必须)
DROP TABLE IF EXISTS `report_store_daily_stats`;
CREATE TABLE `report_store_daily_stats` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `stat_date` DATE NOT NULL COMMENT '统计日期',
    `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
    `store_id` BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
    `store_name` VARCHAR(255) NOT NULL COMMENT '门店名称快照',
    
    -- 交易数据
    `total_order_count` INT UNSIGNED DEFAULT 0 COMMENT '总订单数(下单)',
    `paid_order_count` INT UNSIGNED DEFAULT 0 COMMENT '支付订单数',
    `total_sales_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '总交易额(GMV)',
    `real_pay_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '实付金额',
    
    -- 退款数据
    `refund_order_count` INT UNSIGNED DEFAULT 0 COMMENT '退款订单数',
    `refund_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '退款金额',
    
    -- 流量数据(拓展)
    `visitor_count` INT UNSIGNED DEFAULT 0 COMMENT '访客数(UV)-预留',
    `page_view_count` INT UNSIGNED DEFAULT 0 COMMENT '浏览量(PV)-预留',
    
    -- 客单价
    `avg_order_value` DECIMAL(10,2) DEFAULT 0.00 COMMENT '客单价(实付/支付单数)',

    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    
    UNIQUE INDEX `uk_date_store` (`stat_date`, `store_id`),
    INDEX `idx_merchant_date` (`merchant_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-门店经营日报';

-- 2. 商品销售排行日报表 (基础报表-必须)
DROP TABLE IF EXISTS `report_goods_sales_daily`;
CREATE TABLE `report_goods_sales_daily` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `stat_date` DATE NOT NULL COMMENT '统计日期',
    `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
    `store_id` BIGINT UNSIGNED NOT NULL COMMENT '门店ID',
    `sku_id` BIGINT UNSIGNED NOT NULL COMMENT 'SKU ID',
    `product_name` VARCHAR(255) NOT NULL COMMENT '商品名称快照',
    `sku_spec` VARCHAR(255) NULL COMMENT '规格名称快照',
    
    `sales_count` INT UNSIGNED DEFAULT 0 COMMENT '销售件数',
    `sales_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '销售金额',
    
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    
    INDEX `idx_date_store` (`stat_date`, `store_id`),
    INDEX `idx_sku` (`sku_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-商品销售日报';

-- 3. 商家结算日报表 (财务报表-基础)
-- 记录每天的资金汇总情况，支持按天对账
DROP TABLE IF EXISTS `report_merchant_settlement_daily`;
CREATE TABLE `report_merchant_settlement_daily` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `stat_date` DATE NOT NULL COMMENT '账单日期',
    `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
    `merchant_name` VARCHAR(255) NOT NULL COMMENT '商家名称快照',
    
    -- 收入 (Income)
    `total_turnover` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '总营业额(GMV)',
    `wechat_pay_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '微信支付收入',
    `balance_pay_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '余额支付收入',
    `marketing_income` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '营销分润收入(作为接收方)',
    
    -- 支出/扣减 (Expenditure/Deduction)
    `refund_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '退款金额(退给用户)',
    `platform_commission` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '平台佣金扣除',
    `marketing_expenditure` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '营销分润支出(作为支付方)',
    
    -- 结算结果 (Settlement)
    `settle_base_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '应结基数(微信支付+余额支付+营销收入)',
    `real_settle_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '实结金额(应结-退款-佣金-营销支出)',
    
    `settle_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '结算状态: PENDING-待结算; SETTLED-已结算; PARTIAL-部分结算',
    `settled_time` TIMESTAMP NULL COMMENT '完成结算时间',
    
    `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
    `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
    
    UNIQUE INDEX `uk_date_merchant` (`stat_date`, `merchant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-商家每日结算账单';

-- 4. 商家结算明细表 (财务报表-明细)
-- 记录每一笔导致资金变动的业务明细，用于"查账"
DROP TABLE IF EXISTS `report_settlement_detail`;
CREATE TABLE `report_settlement_detail` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `stat_date` DATE NOT NULL COMMENT '归属日期',
    `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
    
    `biz_type` VARCHAR(32) NOT NULL COMMENT '业务类型: ORDER-订单收款; REFUND-订单退款; MARKETING_INCOME-分润收入; MARKETING_PAY-分润支出',
    `biz_no` VARCHAR(64) NOT NULL COMMENT '业务单号(订单号/流水号)',
    `related_id` BIGINT UNSIGNED NULL COMMENT '关联ID(如order_id/record_id)',
    
    `trade_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '交易金额(正负表示方向)',
    `commission_rate` DECIMAL(5,4) DEFAULT 0.0000 COMMENT '费率(如0.006)',
    `commission_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '手续费/佣金',
    `settle_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '结算入账金额(交易金额-佣金)',
    
    `remark` VARCHAR(255) NULL COMMENT '摘要/备注',
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    
    INDEX `idx_date_merchant` (`stat_date`, `merchant_id`),
    INDEX `idx_biz` (`biz_no`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-商家结算资金明细';

-- 5. 商家月度账单表 (财务报表-汇总)
DROP TABLE IF EXISTS `report_merchant_monthly_bill`;
CREATE TABLE `report_merchant_monthly_bill` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    `stat_month` VARCHAR(7) NOT NULL COMMENT '统计月份(YYYY-MM)',
    `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
    `merchant_name` VARCHAR(255) NOT NULL COMMENT '商家名称快照',
    
    `total_income` DECIMAL(15,2) DEFAULT 0.00 COMMENT '本月总收入',
    `total_expenditure` DECIMAL(15,2) DEFAULT 0.00 COMMENT '本月总支出(退款+佣金+营销)',
    `final_settle_amount` DECIMAL(15,2) DEFAULT 0.00 COMMENT '本月应结净额',
    
    `settle_status` VARCHAR(20) DEFAULT 'PENDING' COMMENT '月结状态',
    
    `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE INDEX `uk_month_merchant` (`stat_month`, `merchant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-商家月度账单';

-- [已删除] 以下4张审计类报表表已废弃，聚焦销售/财务侧核心报表
-- 废弃: report_platform_daily_stats (平台运营日报)
-- 废弃: report_store_user_daily (门店用户分析日报)
-- 废弃: report_store_marketing_daily (门店营销效果日报)
-- 废弃: report_store_hour_daily (门店时段销售趋势)
-- 新增报表请参见: db/report_tables_new.sql



-- =====================================================
-- 新增销售/财务侧报表表结构
-- =====================================================

-- =====================================================
-- 1. 商品分类销售汇总表
-- 按分类维度统计销售情况，便于品类分析和选品决策
-- =====================================================
DROP TABLE IF EXISTS `report_category_sales_summary`;
CREATE TABLE `report_category_sales_summary` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NULL COMMENT '门店ID',
  `category_id` BIGINT UNSIGNED NOT NULL COMMENT '商品分类ID',
  `category_name` VARCHAR(100) NOT NULL COMMENT '分类名称快照',
  `sales_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '销售数量',
  `sales_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '销售金额',
  `sales_ratio` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '销售占比(百分比)',
  `order_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '订单数',
  `sku_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'SKU数量(该分类下有销售的SKU数)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_date_store_category` (`stat_date`, `store_id`, `category_id`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`),
  KEY `idx_category_date` (`category_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-商品分类销售汇总';

-- =====================================================
-- 2. 退款分析报表
-- 分析退款原因、退款率，帮助商家优化服务和商品质量
-- =====================================================
DROP TABLE IF EXISTS `report_refund_analysis`;
CREATE TABLE `report_refund_analysis` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NULL COMMENT '门店ID',
  `refund_order_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '退款订单数',
  `refund_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '退款金额',
  `refund_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '退款率(百分比)',
  `user_cancel_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '用户主动取消数',
  `merchant_cancel_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '商家取消数',
  `timeout_cancel_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '超时自动取消数',
  `after_sale_refund_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '售后退款数',
  `avg_refund_hours` DECIMAL(6,2) NULL COMMENT '平均退款处理时长(小时)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_date_store` (`stat_date`, `store_id`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-退款分析';

-- =====================================================
-- 3. 支付渠道对账报表
-- 按支付渠道统计交易情况，便于财务对账和渠道成本分析
-- =====================================================
DROP TABLE IF EXISTS `report_pay_channel_reconcile`;
CREATE TABLE `report_pay_channel_reconcile` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `pay_channel` VARCHAR(30) NOT NULL COMMENT '支付渠道: WECHAT_MINI-微信小程序; WECHAT_MP-微信公众号; BALANCE-余额支付',
  `transaction_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '交易笔数',
  `transaction_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '交易金额',
  `refund_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '退款笔数',
  `refund_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '退款金额',
  `net_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '净交易金额(交易-退款)',
  `channel_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '渠道手续费',
  `fee_rate` DECIMAL(6,4) NOT NULL DEFAULT 0.0000 COMMENT '手续费率',
  `reconcile_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '对账状态: PENDING-待对账; MATCHED-已对账; MISMATCH-差异',
  `diff_amount` DECIMAL(10,2) NULL DEFAULT 0.00 COMMENT '差异金额',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_date_merchant_channel` (`stat_date`, `merchant_id`, `pay_channel`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`),
  KEY `idx_channel_date` (`pay_channel`, `stat_date`),
  KEY `idx_reconcile_status` (`reconcile_status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-支付渠道对账';

-- =====================================================
-- 4. 应收账款报表
-- 统计待结算金额和账龄，便于财务管理和现金流预测
-- =====================================================
DROP TABLE IF EXISTS `report_receivable`;
CREATE TABLE `report_receivable` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `merchant_name` VARCHAR(255) NOT NULL COMMENT '商家名称快照',
  `total_receivable` DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT '待结算总金额',
  `aging_0_to_7` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '0-7天账龄金额',
  `aging_8_to_15` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '8-15天账龄金额',
  `aging_16_to_30` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '16-30天账龄金额',
  `aging_over_30` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '30天以上账龄金额',
  `pending_order_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '待结算订单数',
  `expected_settle_date` DATE NULL COMMENT '预计结算日期',
  `last_settled_amount` DECIMAL(12,2) NULL DEFAULT 0.00 COMMENT '上期已结算金额',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_date_merchant` (`stat_date`, `merchant_id`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`),
  KEY `idx_total_receivable` (`total_receivable`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-应收账款';

-- =====================================================
-- Part 5: 新增报表数据表 (7张)
-- 用于支持报表模块的营销分析、平台运营等功能
-- =====================================================

-- =====================================================
-- 1. 优惠券使用分析表
-- 统计优惠券发放和核销情况，评估营销活动效果
-- Requirements: 10
-- =====================================================
DROP TABLE IF EXISTS `report_coupon_analysis`;
CREATE TABLE `report_coupon_analysis` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NULL COMMENT '门店ID',
  `coupon_type` VARCHAR(20) NOT NULL COMMENT '优惠券类型: DISCOUNT-折扣券; AMOUNT-满减券',
  `coupon_source` VARCHAR(20) NOT NULL COMMENT '来源: SELF-自有; JOINT-联合营销',
  `issued_count` INT UNSIGNED DEFAULT 0 COMMENT '发放数量',
  `used_count` INT UNSIGNED DEFAULT 0 COMMENT '核销数量',
  `use_rate` DECIMAL(5,2) DEFAULT 0.00 COMMENT '核销率(%)',
  `discount_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '优惠金额',
  `driven_sales` DECIMAL(12,2) DEFAULT 0.00 COMMENT '带动销售额',
  `roi` DECIMAL(6,2) DEFAULT 0.00 COMMENT 'ROI(带动销售/优惠金额)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  UNIQUE KEY `uk_date_store_type` (`stat_date`, `store_id`, `coupon_type`, `coupon_source`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-优惠券使用分析';

-- =====================================================
-- 2. 积分流水报表
-- 统计积分发放和消耗情况，了解积分成本和用户活跃度
-- Requirements: 11
-- =====================================================
DROP TABLE IF EXISTS `report_points_flow`;
CREATE TABLE `report_points_flow` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NULL COMMENT '门店ID',
  `source_type` VARCHAR(30) NOT NULL COMMENT '来源类型: CONSUME-消费得; SIGN_IN-签到; ACTIVITY-活动; ADJUST-系统调整',
  `earned_points` BIGINT DEFAULT 0 COMMENT '发放积分',
  `consumed_points` BIGINT DEFAULT 0 COMMENT '消耗积分',
  `expired_points` BIGINT DEFAULT 0 COMMENT '过期积分',
  `net_points` BIGINT DEFAULT 0 COMMENT '净增积分',
  `deduction_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '积分抵扣金额',
  `equivalent_cost` DECIMAL(12,2) DEFAULT 0.00 COMMENT '等效成本',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  UNIQUE KEY `uk_date_store_source` (`stat_date`, `store_id`, `source_type`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-积分流水';

-- =====================================================
-- 3. 用户消费分析表
-- 统计用户消费行为，了解用户价值分布和消费习惯
-- Requirements: 12
-- =====================================================
DROP TABLE IF EXISTS `report_user_consumption`;
CREATE TABLE `report_user_consumption` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NULL COMMENT '门店ID',
  `new_user_count` INT UNSIGNED DEFAULT 0 COMMENT '新用户数',
  `active_user_count` INT UNSIGNED DEFAULT 0 COMMENT '活跃用户数',
  `repurchase_user_count` INT UNSIGNED DEFAULT 0 COMMENT '复购用户数',
  `repurchase_rate` DECIMAL(5,2) DEFAULT 0.00 COMMENT '复购率(%)',
  `amount_0_50` INT UNSIGNED DEFAULT 0 COMMENT '消费0-50元用户数',
  `amount_50_100` INT UNSIGNED DEFAULT 0 COMMENT '消费50-100元用户数',
  `amount_100_200` INT UNSIGNED DEFAULT 0 COMMENT '消费100-200元用户数',
  `amount_200_plus` INT UNSIGNED DEFAULT 0 COMMENT '消费200元以上用户数',
  `avg_purchase_cycle` DECIMAL(6,2) DEFAULT 0.00 COMMENT '平均消费周期(天)',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  UNIQUE KEY `uk_date_store` (`stat_date`, `store_id`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-用户消费分析';

-- =====================================================
-- 4. 联合营销效果表
-- 统计联合营销活动效果，评估跨商家合作收益
-- Requirements: 13
-- =====================================================
DROP TABLE IF EXISTS `report_joint_marketing`;
CREATE TABLE `report_joint_marketing` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `role_type` VARCHAR(20) NOT NULL COMMENT '角色: INITIATOR-发起方; PARTICIPANT-参与方',
  `trigger_count` INT UNSIGNED DEFAULT 0 COMMENT '活动触发次数',
  `coupon_issued` INT UNSIGNED DEFAULT 0 COMMENT '发券数量',
  `coupon_used` INT UNSIGNED DEFAULT 0 COMMENT '核销数量',
  `share_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '分润金额',
  `new_customer_count` INT UNSIGNED DEFAULT 0 COMMENT '新客户数(引流)',
  `cross_merchant_orders` INT UNSIGNED DEFAULT 0 COMMENT '跨商家订单数',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  UNIQUE KEY `uk_date_merchant_role` (`stat_date`, `merchant_id`, `role_type`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-联合营销效果';

-- =====================================================
-- 5. 区域代理佣金表
-- 统计代理佣金情况，管理代理结算和评估代理绩效
-- Requirements: 14
-- =====================================================
DROP TABLE IF EXISTS `report_agent_commission`;
CREATE TABLE `report_agent_commission` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT '代理ID',
  `agent_name` VARCHAR(100) NOT NULL COMMENT '代理名称',
  `region_code` VARCHAR(20) NULL COMMENT '区域编码',
  `region_name` VARCHAR(100) NULL COMMENT '区域名称',
  `total_commission` DECIMAL(12,2) DEFAULT 0.00 COMMENT '佣金总额',
  `settled_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '已结算金额',
  `pending_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '待结算金额',
  `withdrawn_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '已提现金额',
  `order_count` INT UNSIGNED DEFAULT 0 COMMENT '订单数量',
  `merchant_count` INT UNSIGNED DEFAULT 0 COMMENT '商家数量',
  `rank_by_commission` INT UNSIGNED NULL COMMENT '佣金排名',
  `rank_by_orders` INT UNSIGNED NULL COMMENT '订单排名',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  UNIQUE KEY `uk_date_agent` (`stat_date`, `agent_id`),
  KEY `idx_region_date` (`region_code`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-区域代理佣金';

-- =====================================================
-- 6. 平台运营概览表
-- 统计平台级汇总数据，了解平台业务健康状况
-- Requirements: 15
-- =====================================================
DROP TABLE IF EXISTS `report_platform_overview`;
CREATE TABLE `report_platform_overview` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `total_gmv` DECIMAL(15,2) DEFAULT 0.00 COMMENT '总GMV',
  `total_orders` INT UNSIGNED DEFAULT 0 COMMENT '总订单数',
  `active_merchants` INT UNSIGNED DEFAULT 0 COMMENT '活跃商家数',
  `active_users` INT UNSIGNED DEFAULT 0 COMMENT '活跃用户数',
  `commission_income` DECIMAL(12,2) DEFAULT 0.00 COMMENT '平台佣金收入',
  `share_expenditure` DECIMAL(12,2) DEFAULT 0.00 COMMENT '分润支出',
  `net_income` DECIMAL(12,2) DEFAULT 0.00 COMMENT '净收入',
  `gmv_yoy` DECIMAL(6,2) NULL COMMENT 'GMV同比(%)',
  `gmv_mom` DECIMAL(6,2) NULL COMMENT 'GMV环比(%)',
  `orders_yoy` DECIMAL(6,2) NULL COMMENT '订单同比(%)',
  `orders_mom` DECIMAL(6,2) NULL COMMENT '订单环比(%)',

  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  UNIQUE KEY `uk_stat_date` (`stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-平台运营概览';

-- =====================================================
-- 7. 时段销售趋势表
-- 按小时分组统计销售数据，优化营业时间和人员排班
-- Requirements: 16
-- =====================================================
DROP TABLE IF EXISTS `report_hourly_sales`;
CREATE TABLE `report_hourly_sales` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `stat_date` DATE NOT NULL COMMENT '统计日期',
  `merchant_id` BIGINT UNSIGNED NOT NULL COMMENT '商家ID',
  `store_id` BIGINT UNSIGNED NULL COMMENT '门店ID',
  `hour_of_day` TINYINT UNSIGNED NOT NULL COMMENT '小时(0-23)',
  `order_count` INT UNSIGNED DEFAULT 0 COMMENT '订单数',
  `sales_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '销售额',
  `avg_order_value` DECIMAL(10,2) DEFAULT 0.00 COMMENT '客单价',
  `is_peak` TINYINT(1) DEFAULT 0 COMMENT '是否高峰时段',
  `is_valley` TINYINT(1) DEFAULT 0 COMMENT '是否低谷时段',

  `created_by` BIGINT UNSIGNED NULL COMMENT '创建人ID',
  `created_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_by` BIGINT UNSIGNED NULL COMMENT '修改人ID',
  `updated_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已删除(软删除)',
  `deleted_time` TIMESTAMP NULL COMMENT '删除时间(软删除)',
  UNIQUE KEY `uk_date_store_hour` (`stat_date`, `store_id`, `hour_of_day`),
  KEY `idx_merchant_date` (`merchant_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT '报表-时段销售趋势表';
