-- =========================================================
-- CloudFlow Pro - 工作流监控告警模块数据库脚本
-- 模块：流程执行监控、超时告警、异常检测
-- 版本：v1.0
-- 创建日期：2026-02-21
-- =========================================================

USE cloud_flow_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 一、流程执行监控
-- =========================================================

-- 1. 流程执行监控表
DROP TABLE IF EXISTS wf_process_monitor;
CREATE TABLE wf_process_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
    process_def_id    VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '流程定义名称',
    business_key      VARCHAR(100)    DEFAULT NULL COMMENT '业务键',
    start_time        DATETIME        NOT NULL COMMENT '开始时间',
    end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
    duration          BIGINT(20)      DEFAULT NULL COMMENT '执行时长(毫秒)',
    status            VARCHAR(20)     NOT NULL COMMENT '状态：RUNNING/COMPLETED/FAILED/TERMINATED',
    node_count        INT(11)         DEFAULT 0 COMMENT '已执行节点数量',
    task_count        INT(11)         DEFAULT 0 COMMENT '已完成任务数量',
    error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
    start_user_id     BIGINT(20)      DEFAULT NULL COMMENT '发起人ID',
    start_user_name   VARCHAR(50)     DEFAULT NULL COMMENT '发起人姓名',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_instance (instance_id),
    KEY idx_tenant (tenant_id),
    KEY idx_process_def (process_def_key),
    KEY idx_status (status),
    KEY idx_start_time (start_time),
    KEY idx_duration (duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程执行监控表';

-- 2. 节点执行监控表
DROP TABLE IF EXISTS wf_node_monitor;
CREATE TABLE wf_node_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
    node_id           VARCHAR(64)     NOT NULL COMMENT '节点ID',
    node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
    node_name         VARCHAR(100)    NOT NULL COMMENT '节点名称',
    node_type         VARCHAR(20)     NOT NULL COMMENT '节点类型',
    start_time        DATETIME        NOT NULL COMMENT '开始时间',
    end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
    duration          BIGINT(20)      DEFAULT NULL COMMENT '执行时长(毫秒)',
    status            VARCHAR(20)     NOT NULL COMMENT '状态：RUNNING/COMPLETED/FAILED/SKIPPED',
    error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
    retry_count       INT(11)         DEFAULT 0 COMMENT '重试次数',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_instance (instance_id),
    KEY idx_node (node_key),
    KEY idx_status (status),
    KEY idx_start_time (start_time),
    KEY idx_duration (duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点执行监控表';

-- 3. 任务执行监控表
DROP TABLE IF EXISTS wf_task_monitor;
CREATE TABLE wf_task_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
    node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
    task_name         VARCHAR(100)    NOT NULL COMMENT '任务名称',
    assignee_id       BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
    assignee_name     VARCHAR(50)     DEFAULT NULL COMMENT '处理人姓名',
    create_time_task  DATETIME        NOT NULL COMMENT '任务创建时间',
    claim_time        DATETIME        DEFAULT NULL COMMENT '认领时间',
    complete_time     DATETIME        DEFAULT NULL COMMENT '完成时间',
    wait_duration     BIGINT(20)      DEFAULT NULL COMMENT '等待时长(毫秒)',
    handle_duration   BIGINT(20)      DEFAULT NULL COMMENT '处理时长(毫秒)',
    total_duration    BIGINT(20)      DEFAULT NULL COMMENT '总时长(毫秒)',
    status            VARCHAR(20)     NOT NULL COMMENT '状态：PENDING/CLAIMED/COMPLETED/TIMEOUT',
    action            VARCHAR(20)     DEFAULT NULL COMMENT '操作：APPROVE/REJECT/TRANSFER/DELEGATE',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_task (task_id),
    KEY idx_tenant (tenant_id),
    KEY idx_instance (instance_id),
    KEY idx_assignee (assignee_id),
    KEY idx_status (status),
    KEY idx_create_time (create_time_task),
    KEY idx_total_duration (total_duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务执行监控表';

-- =========================================================
-- 二、超时告警
-- =========================================================

-- 4. 超时告警记录表
DROP TABLE IF EXISTS wf_timeout_alert;
CREATE TABLE wf_timeout_alert (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    alert_type        VARCHAR(20)     NOT NULL COMMENT '告警类型：TASK/PROCESS',
    target_id         VARCHAR(64)     NOT NULL COMMENT '目标ID（任务ID或流程实例ID）',
    target_name       VARCHAR(100)    NOT NULL COMMENT '目标名称',
    timeout_level     VARCHAR(20)     NOT NULL COMMENT '超时级别：REMIND/WARNING/CRITICAL',
    timeout_duration  BIGINT(20)      NOT NULL COMMENT '超时时长(毫秒)',
    threshold         BIGINT(20)      NOT NULL COMMENT '阈值(毫秒)',
    assignee_id       BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
    assignee_name     VARCHAR(50)     DEFAULT NULL COMMENT '处理人姓名',
    alert_time        DATETIME        NOT NULL COMMENT '告警时间',
    notification_sent CHAR(1)         DEFAULT 'N' COMMENT '是否已发送通知（Y是 N否）',
    escalated         CHAR(1)         DEFAULT 'N' COMMENT '是否已升级（Y是 N否）',
    resolved          CHAR(1)         DEFAULT 'N' COMMENT '是否已解决（Y是 N否）',
    resolve_time      DATETIME        DEFAULT NULL COMMENT '解决时间',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_alert_type (alert_type),
    KEY idx_target (target_id),
    KEY idx_timeout_level (timeout_level),
    KEY idx_assignee (assignee_id),
    KEY idx_alert_time (alert_time),
    KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='超时告警记录表';

-- =========================================================
-- 三、异常检测
-- =========================================================

-- 5. 异常流程记录表
DROP TABLE IF EXISTS wf_anomaly_alert;
CREATE TABLE wf_anomaly_alert (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    anomaly_type      VARCHAR(30)     NOT NULL COMMENT '异常类型：EXECUTION_FAILED/DEADLOCK/INFINITE_LOOP/NO_ASSIGNEE/PERMISSION_ERROR/DATA_INCONSISTENCY',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '流程定义名称',
    node_key          VARCHAR(64)     DEFAULT NULL COMMENT '节点Key',
    node_name         VARCHAR(100)    DEFAULT NULL COMMENT '节点名称',
    task_id           VARCHAR(64)     DEFAULT NULL COMMENT '任务ID',
    error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
    stack_trace       TEXT            DEFAULT NULL COMMENT '堆栈跟踪',
    severity          VARCHAR(20)     NOT NULL COMMENT '严重程度：LOW/MEDIUM/HIGH/CRITICAL',
    alert_time        DATETIME        NOT NULL COMMENT '告警时间',
    notification_sent CHAR(1)         DEFAULT 'N' COMMENT '是否已发送通知（Y是 N否）',
    resolved          CHAR(1)         DEFAULT 'N' COMMENT '是否已解决（Y是 N否）',
    resolve_time      DATETIME        DEFAULT NULL COMMENT '解决时间',
    resolve_note      TEXT            DEFAULT NULL COMMENT '解决说明',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_anomaly_type (anomaly_type),
    KEY idx_instance (instance_id),
    KEY idx_process_def (process_def_key),
    KEY idx_severity (severity),
    KEY idx_alert_time (alert_time),
    KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异常流程记录表';

-- =========================================================
-- 四、监控统计
-- =========================================================

-- 6. 流程性能统计表（按天汇总）
DROP TABLE IF EXISTS wf_performance_stats;
CREATE TABLE wf_performance_stats (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    stat_date         DATE            NOT NULL COMMENT '统计日期',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '流程定义名称',
    total_count       INT(11)         DEFAULT 0 COMMENT '总流程数',
    completed_count   INT(11)         DEFAULT 0 COMMENT '完成数',
    failed_count      INT(11)         DEFAULT 0 COMMENT '失败数',
    avg_duration      BIGINT(20)      DEFAULT 0 COMMENT '平均执行时长(毫秒)',
    max_duration      BIGINT(20)      DEFAULT 0 COMMENT '最大执行时长(毫秒)',
    min_duration      BIGINT(20)      DEFAULT 0 COMMENT '最小执行时长(毫秒)',
    timeout_count     INT(11)         DEFAULT 0 COMMENT '超时数',
    anomaly_count     INT(11)         DEFAULT 0 COMMENT '异常数',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_stat (tenant_id, stat_date, process_def_key),
    KEY idx_tenant (tenant_id),
    KEY idx_stat_date (stat_date),
    KEY idx_process_def (process_def_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程性能统计表';

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================
