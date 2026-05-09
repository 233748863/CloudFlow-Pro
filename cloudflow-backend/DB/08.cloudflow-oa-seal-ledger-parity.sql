-- 印章台账同款扩展增量脚本
-- 作用：给印章台账补齐编号/签发/有效期/附件，并新增印章续期与到期提醒能力。

SET @schema_name = DATABASE();

SET @add_seal_no_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oa_seal ADD COLUMN seal_no VARCHAR(100) DEFAULT NULL COMMENT ''印章编号'' AFTER seal_type',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'oa_seal'
    AND COLUMN_NAME = 'seal_no'
);
PREPARE add_seal_no_stmt FROM @add_seal_no_sql;
EXECUTE add_seal_no_stmt;
DEALLOCATE PREPARE add_seal_no_stmt;

SET @add_issuer_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oa_seal ADD COLUMN issuer VARCHAR(100) DEFAULT NULL COMMENT ''签发/备案机构'' AFTER seal_no',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'oa_seal'
    AND COLUMN_NAME = 'issuer'
);
PREPARE add_issuer_stmt FROM @add_issuer_sql;
EXECUTE add_issuer_stmt;
DEALLOCATE PREPARE add_issuer_stmt;

SET @add_issue_date_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oa_seal ADD COLUMN issue_date DATE DEFAULT NULL COMMENT ''签发/启用日期'' AFTER issuer',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'oa_seal'
    AND COLUMN_NAME = 'issue_date'
);
PREPARE add_issue_date_stmt FROM @add_issue_date_sql;
EXECUTE add_issue_date_stmt;
DEALLOCATE PREPARE add_issue_date_stmt;

SET @add_expire_date_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oa_seal ADD COLUMN expire_date DATE DEFAULT NULL COMMENT ''到期日期'' AFTER issue_date',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'oa_seal'
    AND COLUMN_NAME = 'expire_date'
);
PREPARE add_expire_date_stmt FROM @add_expire_date_sql;
EXECUTE add_expire_date_stmt;
DEALLOCATE PREPARE add_expire_date_stmt;

SET @add_attachment_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oa_seal ADD COLUMN attachment_url VARCHAR(1000) DEFAULT NULL COMMENT ''印章附件URL(多个用逗号分隔)'' AFTER location',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'oa_seal'
    AND COLUMN_NAME = 'attachment_url'
);
PREPARE add_attachment_stmt FROM @add_attachment_sql;
EXECUTE add_attachment_stmt;
DEALLOCATE PREPARE add_attachment_stmt;

SET @add_expire_idx_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oa_seal ADD INDEX idx_seal_expire (expire_date)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'oa_seal'
    AND INDEX_NAME = 'idx_seal_expire'
);
PREPARE add_expire_idx_stmt FROM @add_expire_idx_sql;
EXECUTE add_expire_idx_stmt;
DEALLOCATE PREPARE add_expire_idx_stmt;

CREATE TABLE IF NOT EXISTS oa_seal_renewal (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID',
  renewal_no        VARCHAR(50)     NOT NULL COMMENT '续期申请编号',
  seal_id           BIGINT(20)      NOT NULL COMMENT '印章ID',
  seal_name         VARCHAR(100)    DEFAULT NULL COMMENT '印章名称快照',
  seal_no           VARCHAR(100)    DEFAULT NULL COMMENT '印章编号快照',
  old_issue_date    DATE            DEFAULT NULL COMMENT '原签发/启用日期',
  old_expire_date   DATE            DEFAULT NULL COMMENT '原到期日期',
  new_issue_date    DATE            DEFAULT NULL COMMENT '新签发/启用日期',
  new_expire_date   DATE            NOT NULL COMMENT '新到期日期',
  applicant_id      BIGINT(20)      DEFAULT NULL COMMENT '申请人ID',
  applicant_name    VARCHAR(64)     DEFAULT NULL COMMENT '申请人姓名',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  dept_name         VARCHAR(64)     DEFAULT NULL COMMENT '部门名称',
  renewal_reason    VARCHAR(500)    NOT NULL COMMENT '续期原因',
  attachment_url    VARCHAR(1000)   DEFAULT NULL COMMENT '续期附件URL(多个用逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/REJECTED/CANCELLED)',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志(0正常 1删除)',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_seal_renewal_no (renewal_no),
  KEY idx_seal_renewal_seal (seal_id),
  KEY idx_seal_renewal_status (status),
  KEY idx_seal_renewal_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='印章续期申请表';

CREATE TABLE IF NOT EXISTS oa_seal_expiry_reminder_log (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  seal_id           BIGINT(20)      NOT NULL COMMENT '印章ID',
  seal_name         VARCHAR(100)    DEFAULT NULL COMMENT '印章名称',
  expire_date       DATE            NOT NULL COMMENT '到期日期',
  days_before       INT(11)         DEFAULT 0 COMMENT '提前提醒天数',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '接收人ID',
  recipient_name    VARCHAR(64)     DEFAULT NULL COMMENT '接收人姓名',
  reminder_type     VARCHAR(20)     NOT NULL COMMENT '提醒类型(AUTO自动/MANUAL手动)',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  reminder_content  VARCHAR(500)    DEFAULT NULL COMMENT '提醒内容',
  reminder_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '提醒时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_seal_expiry_round (seal_id, expire_date, days_before, recipient_id),
  KEY idx_seal_expiry_log_tenant (tenant_id),
  KEY idx_seal_expiry_log_seal (seal_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='印章到期提醒日志表';

INSERT IGNORE INTO wf_form_definition (form_id, form_name, fields_json, create_time)
VALUES (
  'form_seal_renewal',
  '印章续期审批表单',
  '[{"id":"sealName","type":"TEXT","label":"印章名称","required":true},{"id":"oldExpireDate","type":"DATE","label":"原到期日期","required":false},{"id":"newExpireDate","type":"DATE","label":"新到期日期","required":true},{"id":"reason","type":"TEXTAREA","label":"续期原因","required":true}]',
  NOW()
);

INSERT IGNORE INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, form_id, model_json, create_time)
VALUES (
  'wf_seal_renewal',
  '印章续期审批流程',
  'seal_renewal',
  1,
  'PUBLISHED',
  1,
  'OA',
  'form_seal_renewal',
  '{"nodes":[{"id":"root","type":"START","title":"提交印章续期"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"行政审批","approverType":"ROLE","approverValue":"admin"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}',
  NOW()
);
