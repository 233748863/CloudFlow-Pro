CREATE TABLE hr_severance_rule (
  rule_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  rule_code VARCHAR(64) NOT NULL COMMENT '规则编码',
  rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
  effective_from DATE NOT NULL COMMENT '生效日期',
  effective_to DATE DEFAULT NULL COMMENT '失效日期，含当日',
  salary_component_ids JSON NOT NULL COMMENT '月工资基数项目ID白名单',
  averaging_months INT NOT NULL COMMENT '基数取样月数',
  service_rounding VARCHAR(30) NOT NULL COMMENT 'ACTUAL_MONTHS或FLOOR_YEAR或CEIL_HALF_YEAR',
  social_monthly_salary DECIMAL(14,2) DEFAULT NULL COMMENT '核定社会平均月工资',
  base_cap_multiplier DECIMAL(8,4) DEFAULT NULL COMMENT '核定月基数上限倍数',
  max_compensation_months DECIMAL(8,4) DEFAULT NULL COMMENT '核定补偿月数上限',
  notice_months DECIMAL(8,4) NOT NULL DEFAULT 0 COMMENT '经核定的额外通知补偿月数',
  leave_daily_divisor DECIMAL(8,4) DEFAULT NULL COMMENT '年假折现月工资除数',
  leave_hours_per_day DECIMAL(8,4) DEFAULT NULL COMMENT '小时假折现的每日小时数',
  leave_cash_multiplier DECIMAL(8,4) DEFAULT NULL COMMENT '经核定的年假折现系数',
  policy_file_id BIGINT(20) DEFAULT NULL COMMENT '核定政策私有文件ID',
  confirmed_by BIGINT(20) DEFAULT NULL COMMENT '政策核定人',
  confirmed_time DATETIME DEFAULT NULL COMMENT '核定时间',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或CONFIRMED或DISABLED',
  remark VARCHAR(500) DEFAULT NULL COMMENT '核定说明',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (rule_id),
  UNIQUE KEY uk_severance_code (tenant_id, rule_code),
  KEY idx_severance_effective (tenant_id, status, effective_from, effective_to),
  CONSTRAINT chk_severance_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_severance_average CHECK (averaging_months BETWEEN 1 AND 120),
  CONSTRAINT chk_severance_caps CHECK ((social_monthly_salary IS NULL OR social_monthly_salary > 0) AND (base_cap_multiplier IS NULL OR base_cap_multiplier > 0) AND (max_compensation_months IS NULL OR max_compensation_months > 0) AND notice_months >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='核定后方可正式使用的离职补偿规则';

CREATE TABLE hr_severance_rule_slab (
  slab_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '工龄分档ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  rule_id BIGINT(20) NOT NULL COMMENT '规则ID',
  sort_no INT NOT NULL COMMENT '档位顺序',
  min_service_years DECIMAL(8,4) NOT NULL COMMENT '含下限的核定工龄',
  max_service_years DECIMAL(8,4) DEFAULT NULL COMMENT '不含上限的核定工龄，空为不限',
  calculation_mode VARCHAR(20) NOT NULL COMMENT 'FIXED或PER_YEAR',
  compensation_months DECIMAL(8,4) NOT NULL COMMENT '固定月数或每工龄年对应月数',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (slab_id),
  UNIQUE KEY uk_severance_slab (tenant_id, rule_id, sort_no),
  CONSTRAINT chk_severance_slab CHECK (min_service_years >= 0 AND (max_service_years IS NULL OR max_service_years > min_service_years) AND compensation_months >= 0),
  CONSTRAINT chk_severance_slab_mode CHECK (calculation_mode IN ('FIXED','PER_YEAR'))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='经济补偿工龄分档';

CREATE TABLE hr_final_settlement (
  settlement_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '结算单ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  settlement_no VARCHAR(64) NOT NULL COMMENT '结算单号',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  lifecycle_application_id BIGINT(20) NOT NULL COMMENT '离职生命周期申请ID',
  settlement_kind VARCHAR(20) NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL或REVERSAL',
  reversal_of_id BIGINT(20) DEFAULT NULL COMMENT '冲正的原结算单ID',
  superseded_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '原单已被完整冲正入账后才可置一',
  active_lifecycle_id BIGINT(20) GENERATED ALWAYS AS (CASE WHEN settlement_kind = 'NORMAL' AND superseded_flag = 0 THEN lifecycle_application_id ELSE NULL END) STORED COMMENT '防止一个离职申请重复形成有效结算',
  join_date DATE NOT NULL COMMENT '入职日期快照',
  relieving_date DATE NOT NULL COMMENT '离职日期快照',
  work_years DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '展示工龄，计算使用规则快照中未舍入值',
  rule_id BIGINT(20) DEFAULT NULL COMMENT '经济补偿规则ID',
  calculation_snapshot JSON DEFAULT NULL COMMENT '来源版本、未舍入工龄、规则、单价和计算明细快照',
  total_payable DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '应付合计',
  total_receivable DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '应收合计',
  asset_recovery_cost DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '核定资产损失合计',
  severance_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '经济补偿合计',
  net_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '应付净额，负值为应收员工',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或CONFIRMED或PAID或CLOSED',
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或SUBMITTED或APPROVED或REJECTED或CANCELLED',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '审批实例ID',
  payment_request_id BIGINT(20) DEFAULT NULL COMMENT 'OA付款申请ID',
  settlement_proof_file_id BIGINT(20) DEFAULT NULL COMMENT '收付款凭据私有文件ID',
  confirmed_by BIGINT(20) DEFAULT NULL COMMENT '结算确认人',
  confirmed_time DATETIME DEFAULT NULL COMMENT '确认时间',
  paid_time DATETIME DEFAULT NULL COMMENT '实际收付完成时间',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注或冲正原因',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (settlement_id),
  UNIQUE KEY uk_settlement_no (tenant_id, settlement_no),
  UNIQUE KEY uk_settlement_reversal (tenant_id, reversal_of_id),
  UNIQUE KEY uk_settlement_active (tenant_id, active_lifecycle_id),
  KEY idx_settlement_employee (tenant_id, employee_id, status),
  KEY idx_settlement_lifecycle (tenant_id, lifecycle_application_id),
  CONSTRAINT chk_settlement_kind CHECK ((settlement_kind = 'NORMAL' AND reversal_of_id IS NULL) OR (settlement_kind = 'REVERSAL' AND reversal_of_id IS NOT NULL)),
  CONSTRAINT chk_settlement_net CHECK (net_amount = total_payable + severance_amount - total_receivable - asset_recovery_cost)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='离职结算及冲正凭证';

CREATE TABLE hr_final_settlement_item (
  item_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '结算明细ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  settlement_id BIGINT(20) NOT NULL COMMENT '结算单ID',
  item_type VARCHAR(20) NOT NULL COMMENT 'PAYABLE或RECEIVABLE或ASSET或SEVERANCE',
  item_name VARCHAR(200) NOT NULL COMMENT '明细名称',
  source_biz_type VARCHAR(50) NOT NULL COMMENT '来源业务类型',
  source_biz_id VARCHAR(64) NOT NULL COMMENT '来源业务ID',
  source_snapshot JSON DEFAULT NULL COMMENT '来源金额、数量单位、版本及资产归还情况',
  amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '金额，冲正单保留有符号反向数',
  confirmed_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '来源及金额是否已核定',
  source_posted_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '来源账本是否实际入账',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (item_id),
  UNIQUE KEY uk_settlement_item_source (tenant_id, settlement_id, source_biz_type, source_biz_id),
  KEY idx_settlement_source (tenant_id, source_biz_type, source_biz_id),
  CONSTRAINT chk_settlement_item_type CHECK (item_type IN ('PAYABLE','RECEIVABLE','ASSET','SEVERANCE'))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='离职结算来源与金额快照';

CREATE TABLE hr_training_recovery (
  recovery_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '培训追偿核定ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  enrollment_id BIGINT(20) NOT NULL COMMENT '真实培训报名ID',
  agreement_file_id BIGINT(20) NOT NULL COMMENT '培训协议私有文件ID',
  assessed_amount DECIMAL(14,2) NOT NULL COMMENT 'HR或法务核定的可追偿金额',
  collected_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '已实际收回金额',
  assessment_reason VARCHAR(1000) NOT NULL COMMENT '核定依据，不自动将培训费用视为违约金',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或CONFIRMED或CLEARED或VOID',
  confirmed_by BIGINT(20) DEFAULT NULL COMMENT '核定人',
  confirmed_time DATETIME DEFAULT NULL COMMENT '核定时间',
  settlement_id BIGINT(20) DEFAULT NULL COMMENT '已占用结算单ID',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (recovery_id),
  UNIQUE KEY uk_training_recovery (tenant_id, employee_id, enrollment_id, agreement_file_id),
  KEY idx_training_recovery_employee (tenant_id, employee_id, status),
  CONSTRAINT chk_training_recovery_amount CHECK (assessed_amount >= 0 AND collected_amount >= 0 AND collected_amount <= assessed_amount)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='有协议和核定依据的培训追偿';

CREATE TABLE hr_exit_interview (
  interview_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '离职面谈ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  lifecycle_application_id BIGINT(20) NOT NULL COMMENT '离职申请ID',
  settlement_id BIGINT(20) DEFAULT NULL COMMENT '结算单ID',
  interviewer_id BIGINT(20) NOT NULL COMMENT '面谈人用户ID',
  interview_time DATETIME NOT NULL COMMENT '面谈时间',
  location VARCHAR(200) DEFAULT NULL COMMENT '地点',
  leaving_reason VARCHAR(1000) DEFAULT NULL COMMENT '离职原因',
  employee_feedback TEXT DEFAULT NULL COMMENT '员工反馈',
  manager_comment TEXT DEFAULT NULL COMMENT '面谈意见，仅授权HR可见',
  improvement_items JSON DEFAULT NULL COMMENT '改进事项',
  attachment_file_ids JSON DEFAULT NULL COMMENT '私有附件ID集合',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或CONFIRMED',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (interview_id),
  KEY idx_exit_interview (tenant_id, lifecycle_application_id, interview_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='离职面谈记录';

CREATE TABLE hr_employee_advance (
  advance_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '员工借款ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  advance_no VARCHAR(64) NOT NULL COMMENT '借款单号',
  employee_id BIGINT(20) NOT NULL COMMENT '借款员工ID',
  advance_amount DECIMAL(14,2) NOT NULL COMMENT '申请借款金额',
  purpose VARCHAR(500) NOT NULL COMMENT '用途',
  apply_date DATE NOT NULL COMMENT '申请日期',
  repay_mode VARCHAR(20) NOT NULL COMMENT 'SALARY_DEDUCT或LUMP_SUM',
  repay_start_month CHAR(7) DEFAULT NULL COMMENT '扣还开始月份yyyy-MM',
  repay_months INT DEFAULT NULL COMMENT '计划扣还月数',
  monthly_deduct_amount DECIMAL(14,2) DEFAULT NULL COMMENT '计划月扣金额，末期按余额收尾',
  repaid_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '已入账还款金额',
  outstanding_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '实际已放款的剩余本金',
  reserved_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '算薪或离职结算预约扣款额',
  written_off_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '经过授权核销金额',
  status VARCHAR(20) NOT NULL DEFAULT 'APPLYING' COMMENT 'APPLYING或APPROVED或PAID或REPAYING或CLEARED或WRITTEN_OFF',
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或SUBMITTED或APPROVED或REJECTED或CANCELLED',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '审批实例ID',
  payment_request_id BIGINT(20) DEFAULT NULL COMMENT 'OA放款申请ID',
  paid_time DATETIME DEFAULT NULL COMMENT '实际放款确认时间',
  rule_snapshot JSON DEFAULT NULL COMMENT '额度、工资项目及扣还规则快照',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (advance_id),
  UNIQUE KEY uk_advance_no (tenant_id, advance_no),
  UNIQUE KEY uk_advance_payment (tenant_id, payment_request_id),
  KEY idx_advance_employee (tenant_id, employee_id, status),
  CONSTRAINT chk_advance_balance CHECK (advance_amount > 0 AND repaid_amount >= 0 AND outstanding_amount >= 0 AND reserved_amount >= 0 AND reserved_amount <= outstanding_amount AND written_off_amount >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工借款及实际余额';

CREATE TABLE hr_advance_repayment (
  repayment_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '还款预约或入账ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  advance_id BIGINT(20) NOT NULL COMMENT '借款ID',
  repay_month CHAR(7) DEFAULT NULL COMMENT '扣还月份yyyy-MM',
  repay_amount DECIMAL(14,2) NOT NULL COMMENT '金额，冲正时使用负数',
  salary_slip_id BIGINT(20) DEFAULT NULL COMMENT '工资单ID',
  settlement_id BIGINT(20) DEFAULT NULL COMMENT '离职结算单ID',
  repay_type VARCHAR(20) NOT NULL COMMENT 'SALARY或MANUAL或SETTLEMENT',
  status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' COMMENT 'RESERVED或POSTED或RELEASED或REVERSED',
  source_event_key VARCHAR(128) NOT NULL COMMENT '业务事件唯一键',
  reversal_of_id BIGINT(20) DEFAULT NULL COMMENT '原入账流水ID',
  proof_file_id BIGINT(20) DEFAULT NULL COMMENT '人工还款凭据私有文件ID',
  repay_date DATE DEFAULT NULL COMMENT '实际还款日期',
  posted_time DATETIME DEFAULT NULL COMMENT '入账时间',
  remark VARCHAR(500) DEFAULT NULL COMMENT '还款或冲正原因',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (repayment_id),
  UNIQUE KEY uk_advance_repayment_event (tenant_id, source_event_key),
  UNIQUE KEY uk_advance_repayment_reversal (tenant_id, reversal_of_id),
  KEY idx_advance_repayment (tenant_id, advance_id, status),
  KEY idx_advance_repayment_slip (tenant_id, salary_slip_id, status),
  CONSTRAINT chk_repayment_sign CHECK ((reversal_of_id IS NULL AND repay_amount > 0) OR (reversal_of_id IS NOT NULL AND repay_amount < 0))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='借款扣还预约及不可覆盖的入账流水';

CREATE TABLE hr_skill (
  skill_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '技能ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  skill_code VARCHAR(64) NOT NULL COMMENT '技能编码',
  skill_name VARCHAR(100) NOT NULL COMMENT '技能名称',
  skill_category VARCHAR(100) DEFAULT NULL COMMENT '技能分类',
  description VARCHAR(1000) DEFAULT NULL COMMENT '技能说明',
  level_definition JSON NOT NULL COMMENT '一至五级的核定描述',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或ACTIVE或DISABLED',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (skill_id),
  UNIQUE KEY uk_skill_code (tenant_id, skill_code)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='技能主数据';

CREATE TABLE hr_position_skill (
  position_skill_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '岗位技能要求ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  position_id BIGINT(20) NOT NULL COMMENT '岗位ID',
  skill_id BIGINT(20) NOT NULL COMMENT '技能ID',
  required_level TINYINT NOT NULL COMMENT '要求等级一至五',
  weight DECIMAL(6,4) NOT NULL COMMENT '权重零至一',
  mandatory_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '一为必备零为加分',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (position_skill_id),
  UNIQUE KEY uk_position_skill (tenant_id, position_id, skill_id),
  CONSTRAINT chk_position_skill CHECK (required_level BETWEEN 1 AND 5 AND weight BETWEEN 0 AND 1)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='岗位技能等级与权重要求';

CREATE TABLE hr_employee_skill (
  employee_skill_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '技能评估记录ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  skill_id BIGINT(20) NOT NULL COMMENT '技能ID',
  current_level TINYINT NOT NULL COMMENT '本次证据支持的一至五级',
  assessed_by BIGINT(20) DEFAULT NULL COMMENT '授权评估人用户ID，自动证据为空',
  assess_time DATETIME DEFAULT NULL COMMENT '评估生效时间',
  evidence_type VARCHAR(30) NOT NULL COMMENT 'TRAINING或EXAM或CERTIFICATE或MANAGER_REVIEW或SELF',
  evidence_biz_id VARCHAR(64) DEFAULT NULL COMMENT '真实证据业务ID',
  evidence_key VARCHAR(128) NOT NULL COMMENT '证据事件或人工请求唯一键',
  evidence_snapshot JSON DEFAULT NULL COMMENT '已核验证据快照',
  assessment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或APPROVED或REJECTED或REVOKED或RECORDED',
  current_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前生效评估，同员工技能最多一条',
  current_skill_id BIGINT(20) GENERATED ALWAYS AS (CASE WHEN current_flag = 1 THEN skill_id ELSE NULL END) STORED COMMENT '当前技能唯一约束键',
  expire_date DATE DEFAULT NULL COMMENT '有效期，含当日',
  remark VARCHAR(500) DEFAULT NULL COMMENT '评估说明',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (employee_skill_id),
  UNIQUE KEY uk_employee_skill_evidence (tenant_id, employee_id, skill_id, evidence_key),
  UNIQUE KEY uk_employee_skill_current (tenant_id, employee_id, current_skill_id),
  KEY idx_employee_skill_history (tenant_id, employee_id, skill_id, assess_time),
  CONSTRAINT chk_employee_skill_level CHECK (current_level BETWEEN 1 AND 5),
  CONSTRAINT chk_employee_skill_current CHECK (current_flag = 0 OR assessment_status = 'APPROVED')
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工技能评估证据及当前结果';

CREATE TABLE hr_appraisal_cycle (
  cycle_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '绩效周期ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  cycle_name VARCHAR(100) NOT NULL COMMENT '周期名称',
  cycle_type VARCHAR(20) NOT NULL COMMENT 'MONTHLY或QUARTERLY或HALF_YEARLY或YEARLY',
  start_date DATE NOT NULL COMMENT '开始日期',
  end_date DATE NOT NULL COMMENT '结束日期',
  scope_dept_ids JSON DEFAULT NULL COMMENT '部门范围ID集合',
  scope_position_ids JSON DEFAULT NULL COMMENT '岗位范围ID集合',
  scope_job_level_ids JSON DEFAULT NULL COMMENT '职级范围ID集合',
  evaluation_method VARCHAR(20) NOT NULL COMMENT 'KRA_WEIGHTED或GOAL_BASED或MIXED',
  final_score_mode VARCHAR(20) NOT NULL COMMENT 'WEIGHTED_AVG或FORMULA',
  final_score_formula VARCHAR(500) DEFAULT NULL COMMENT '仅允许白名单变量及四则运算',
  score_config JSON NOT NULL COMMENT '混合权重、评分上下界及分布舍入规则',
  frozen_config JSON DEFAULT NULL COMMENT '启动时冻结的范围、公式和权重',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或ONGOING或SCORING或CALIBRATING或COMPLETED',
  completed_time DATETIME DEFAULT NULL COMMENT '完成冻结时间',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除，仅草稿允许删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (cycle_id),
  KEY idx_appraisal_cycle (tenant_id, status, start_date, end_date),
  CONSTRAINT chk_appraisal_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_appraisal_formula CHECK (final_score_mode <> 'FORMULA' OR final_score_formula IS NOT NULL)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='绩效周期与评分配置';

CREATE TABLE hr_appraisal_kra (
  kra_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '关键成果领域ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  cycle_id BIGINT(20) NOT NULL COMMENT '绩效周期ID',
  kra_name VARCHAR(100) NOT NULL COMMENT '领域名称',
  weight DECIMAL(6,4) NOT NULL COMMENT '权重零至一',
  sort_no INT NOT NULL DEFAULT 0 COMMENT '排序',
  description VARCHAR(500) DEFAULT NULL COMMENT '说明',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (kra_id),
  UNIQUE KEY uk_appraisal_kra (tenant_id, cycle_id, kra_name),
  CONSTRAINT chk_appraisal_kra_weight CHECK (weight BETWEEN 0 AND 1)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='绩效周期KRA权重';

CREATE TABLE hr_appraisal_result (
  appraisal_result_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '周期参评及最终结果ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  cycle_id BIGINT(20) NOT NULL COMMENT '周期ID',
  employee_id BIGINT(20) NOT NULL COMMENT '参评员工ID',
  scope_snapshot JSON NOT NULL COMMENT '启动时员工所属部门岗位职级快照',
  input_scores JSON DEFAULT NULL COMMENT '目标、KRA和360评分的版本与输入值',
  calculated_score DECIMAL(10,4) DEFAULT NULL COMMENT '按冻结公式计算的原始总分',
  final_score DECIMAL(10,4) DEFAULT NULL COMMENT '经授权校准的最终总分',
  grade VARCHAR(30) DEFAULT NULL COMMENT '最终等级',
  calibration_reason VARCHAR(1000) DEFAULT NULL COMMENT '校准原因，原始分数不覆盖',
  calibrated_by BIGINT(20) DEFAULT NULL COMMENT '校准人',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或SCORED或CALIBRATED或COMPLETED',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (appraisal_result_id),
  UNIQUE KEY uk_appraisal_result (tenant_id, cycle_id, employee_id),
  KEY idx_appraisal_result_employee (tenant_id, employee_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='冻结参评范围及周期最终得分';

CREATE TABLE hr_employee_referral (
  referral_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '内部推荐ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  referral_no VARCHAR(64) NOT NULL COMMENT '推荐单号',
  referrer_employee_id BIGINT(20) NOT NULL COMMENT '推荐员工ID',
  referrer_name VARCHAR(100) NOT NULL COMMENT '推荐人姓名快照',
  candidate_name VARCHAR(100) NOT NULL COMMENT '候选人姓名',
  contact_phone VARCHAR(32) DEFAULT NULL COMMENT '候选人规范化手机号码',
  email VARCHAR(254) DEFAULT NULL COMMENT '候选人规范化邮箱',
  current_employer VARCHAR(200) DEFAULT NULL COMMENT '现任公司',
  current_job_title VARCHAR(100) DEFAULT NULL COMMENT '现任职务',
  target_position_id BIGINT(20) NOT NULL COMMENT '目标岗位ID',
  resume_file_id BIGINT(20) NOT NULL COMMENT '简历私有文件ID，不保存可公开直链',
  referral_reason VARCHAR(1000) DEFAULT NULL COMMENT '推荐理由',
  status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' COMMENT 'SUBMITTED或SCREENING或INTERVIEWING或OFFERED或HIRED或REJECTED或DUPLICATE',
  candidate_id BIGINT(20) DEFAULT NULL COMMENT '招聘候选人ID',
  hire_date DATE DEFAULT NULL COMMENT '核实入职日期',
  bonus_applicable_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否适用已核定奖金',
  bonus_amount DECIMAL(14,2) DEFAULT NULL COMMENT '核定推荐奖金',
  bonus_status VARCHAR(20) NOT NULL DEFAULT 'NOT_APPLICABLE' COMMENT 'NOT_APPLICABLE或PENDING或APPROVED或PAID',
  bonus_pay_date DATE DEFAULT NULL COMMENT '实际工资发放日期',
  bonus_condition_snapshot JSON DEFAULT NULL COMMENT '奖金条件与入职证据快照',
  bonus_condition_remark VARCHAR(500) DEFAULT NULL COMMENT '奖金条件说明',
  comp_change_id BIGINT(20) DEFAULT NULL COMMENT '薪资变动项ID',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '奖金审批实例ID',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (referral_id),
  UNIQUE KEY uk_referral_no (tenant_id, referral_no),
  UNIQUE KEY uk_referral_candidate (tenant_id, candidate_id),
  KEY idx_referral_owner (tenant_id, referrer_employee_id, status),
  CONSTRAINT chk_referral_contact CHECK (contact_phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT chk_referral_bonus CHECK (bonus_amount IS NULL OR bonus_amount >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工推荐与奖金进展';

CREATE TABLE hr_recruitment_identity (
  identity_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '招聘身份占位ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  identity_type VARCHAR(10) NOT NULL COMMENT 'PHONE或EMAIL',
  identity_hash CHAR(64) NOT NULL COMMENT '带租户及类型的规范化联系方式SHA256',
  referral_id BIGINT(20) DEFAULT NULL COMMENT '首次推荐ID',
  candidate_id BIGINT(20) DEFAULT NULL COMMENT '候选人ID',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (identity_id),
  UNIQUE KEY uk_recruitment_identity (tenant_id, identity_type, identity_hash),
  KEY idx_recruitment_identity_candidate (tenant_id, candidate_id),
  CONSTRAINT chk_recruitment_identity_owner CHECK (referral_id IS NOT NULL OR candidate_id IS NOT NULL)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='推荐与候选人共用的联系方式并发去重占位';

ALTER TABLE hr_salary_slip
  ADD COLUMN reserved_settlement_id BIGINT(20) DEFAULT NULL COMMENT '离职结算占位，发薪与冲正均需检查',
  ADD KEY idx_salary_settlement (tenant_id, reserved_settlement_id);

ALTER TABLE hr_training_course
  ADD COLUMN skill_id BIGINT(20) DEFAULT NULL COMMENT '完成培训可提升的技能ID',
  ADD COLUMN target_level TINYINT DEFAULT NULL COMMENT '可提升至一至五级',
  ADD CONSTRAINT chk_training_skill CHECK ((skill_id IS NULL AND target_level IS NULL) OR (skill_id IS NOT NULL AND target_level IS NOT NULL AND target_level BETWEEN 1 AND 5));

ALTER TABLE hr_performance_objective
  ADD COLUMN cycle_id BIGINT(20) DEFAULT NULL COMMENT '新绩效周期ID，空为既有目标',
  ADD COLUMN kra_id BIGINT(20) DEFAULT NULL COMMENT '周期内KRA ID',
  ADD KEY idx_performance_cycle (tenant_id, cycle_id, kra_id);

ALTER TABLE hr_performance_assignment
  ADD COLUMN cycle_id BIGINT(20) DEFAULT NULL COMMENT '所属绩效周期ID，空为既有分派',
  ADD KEY idx_assignment_cycle (tenant_id, cycle_id, assignee_id);

ALTER TABLE hr_perf_distribution_rule
  ADD COLUMN cycle_id BIGINT(20) DEFAULT NULL COMMENT '适用周期，空时保留原目标或全局规则',
  ADD KEY idx_distribution_cycle (tenant_id, cycle_id, status),
  ADD CONSTRAINT chk_distribution_scope CHECK (cycle_id IS NULL OR objective_id IS NULL);

ALTER TABLE hr_talent_calibration_session
  MODIFY COLUMN review_id BIGINT(20) DEFAULT NULL COMMENT '人才盘点ID，与绩效周期互斥',
  ADD COLUMN cycle_id BIGINT(20) DEFAULT NULL COMMENT '绩效周期ID，与人才盘点互斥',
  ADD KEY idx_calibration_cycle (tenant_id, cycle_id),
  ADD CONSTRAINT chk_calibration_scope CHECK ((review_id IS NOT NULL AND cycle_id IS NULL) OR (review_id IS NULL AND cycle_id IS NOT NULL));

ALTER TABLE biz_payment_request
  MODIFY COLUMN amount DECIMAL(14,2) NOT NULL COMMENT '付款金额，与HR结算及借款精度对齐',
  ADD COLUMN source_biz_type VARCHAR(50) DEFAULT NULL COMMENT 'HR_SETTLEMENT或HR_ADVANCE，既有单据为空',
  ADD COLUMN source_biz_id VARCHAR(64) DEFAULT NULL COMMENT '来源业务ID',
  ADD UNIQUE KEY uk_payment_request_source (tenant_id, source_biz_type, source_biz_id),
  ADD CONSTRAINT chk_payment_request_source CHECK ((source_biz_type IS NULL AND source_biz_id IS NULL) OR (source_biz_type IS NOT NULL AND source_biz_id IS NOT NULL));

ALTER TABLE hr_candidate
  MODIFY COLUMN email VARCHAR(254) DEFAULT NULL COMMENT '邮箱';

ALTER TABLE hr_resume_parsed_fields
  MODIFY COLUMN parsed_email VARCHAR(254) DEFAULT NULL COMMENT '解析邮箱';

ALTER TABLE hr_employee
  MODIFY COLUMN email VARCHAR(512) DEFAULT NULL COMMENT '邮箱',
  MODIFY COLUMN phone VARCHAR(64) DEFAULT NULL COMMENT '手机号';

ALTER TABLE sys_user
  MODIFY COLUMN nick_name VARCHAR(100) NOT NULL COMMENT '用户昵称',
  MODIFY COLUMN email VARCHAR(254) DEFAULT '' COMMENT '用户邮箱',
  MODIFY COLUMN phonenumber VARCHAR(16) DEFAULT '' COMMENT '手机号码';
