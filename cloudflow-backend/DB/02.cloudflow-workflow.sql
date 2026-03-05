-- =========================================================
-- CloudFlow Pro - 宸ヤ綔娴佸紩鎿庢牳蹇冩ā鍧楁暟鎹簱鑴氭湰
-- 妯″潡锛氭祦绋嬪畾涔夈€佹祦绋嬪疄渚嬨€佷换鍔＄鐞嗐€佽〃鍗曞畾涔夈€侀€氱煡
-- 鐗堟湰锛歷1.1
-- 鍒涘缓鏃ユ湡锛?026-02-09
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 涓€銆佹祦绋嬪畾涔変笌琛ㄥ崟
-- =========================================================

-- 1. 娴佺▼瀹氫箟琛?
DROP TABLE IF EXISTS wf_process_definition;
CREATE TABLE wf_process_definition (
  definition_id     VARCHAR(64)     NOT NULL COMMENT '瀹氫箟ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  process_name      VARCHAR(64)     NOT NULL COMMENT '娴佺▼鍚嶇О',
  process_key       VARCHAR(64)     NOT NULL COMMENT '娴佺▼Key',
  version           INT             DEFAULT 1 COMMENT '鐗堟湰鍙?,
  form_id           VARCHAR(64)     DEFAULT NULL COMMENT '缁戝畾鐨勮〃鍗旾D',
  model_json        LONGTEXT        COMMENT '娴佺▼妯″瀷JSON',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '鐘舵€?(DRAFT, PUBLISHED, ARCHIVED)',
  version_lock      INT             DEFAULT 0 COMMENT '涔愯閿佺増鏈彿',
  is_latest         TINYINT(1)      DEFAULT 1 COMMENT '鏄惁鏈€鏂扮増鏈?,
  category          VARCHAR(64)     DEFAULT NULL COMMENT '娴佺▼鍒嗙被',
  tags              VARCHAR(500)    DEFAULT NULL COMMENT '娴佺▼鏍囩(JSON鏁扮粍)',
  start_permission_type VARCHAR(20) DEFAULT 'ALL' COMMENT '鍚姩鏉冮檺绫诲瀷 (ALL, USER, ROLE, DEPT)',
  start_permission_value TEXT       COMMENT '鍚姩鏉冮檺鍊?(JSON鏁扮粍)',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '娴佺▼鎻忚堪',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '閮ㄩ棬ID - 鏁版嵁鏉冮檺',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '鍒涘缓鑰?,
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '鏇存柊鑰?,
  create_time       DATETIME        DEFAULT NULL COMMENT '鍒涘缓鏃堕棿',
  update_time       DATETIME        DEFAULT NULL COMMENT '鏇存柊鏃堕棿',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '鍒犻櫎鏍囧織锛?浠ｈ〃瀛樺湪 1浠ｈ〃鍒犻櫎锛?,
  template_id       VARCHAR(64)     DEFAULT NULL COMMENT '鏉ユ簮妯℃澘ID',
  current_version   VARCHAR(20)     DEFAULT '1.0.0' COMMENT '褰撳墠鐗堟湰鍙?,
  is_archived       TINYINT(1)      DEFAULT 0 COMMENT '鏄惁宸插綊妗?,
  PRIMARY KEY (definition_id),
  KEY idx_process_key (process_key),
  KEY idx_status (status),
  KEY idx_is_latest (is_latest),
  KEY idx_dept_id (dept_id),
  KEY idx_create_by (create_by),
  KEY idx_del_flag (del_flag),
  KEY idx_template (template_id),
  KEY idx_archived (is_archived),
  KEY idx_version (current_version),
  KEY idx_template_archived (template_id, is_archived) COMMENT '浼樺寲妯℃澘娴佺▼鏌ヨ',
  KEY idx_current_version (current_version) COMMENT '浼樺寲鐗堟湰鍙锋煡璇?,
  KEY idx_category_status (category, status, is_archived) COMMENT '浼樺寲鍒嗙被绛涢€夋煡璇?,
  UNIQUE KEY uk_proc_def_key_ver_tenant (process_key, version, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='娴佺▼瀹氫箟琛?;

-- 2. 娴佺▼鍒嗙被琛紙鍙傝€?RuoYi-Cloud-Plus FlwCategory 璁捐锛屾敮鎸佹爲褰㈢粨鏋勶級
DROP TABLE IF EXISTS `wf_process_category`;
CREATE TABLE `wf_process_category` (
    `category_id`   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '鍒嗙被ID',
    `parent_id`     BIGINT       DEFAULT 0               COMMENT '鐖跺垎绫籌D锛?琛ㄧず椤剁骇鍒嗙被锛?,
    `category_name` VARCHAR(100) NOT NULL                 COMMENT '鍒嗙被鍚嶇О',
    `category_code` VARCHAR(100) NOT NULL                 COMMENT '鍒嗙被缂栫爜锛堝敮涓€鏍囪瘑锛?,
    `icon`          VARCHAR(100) DEFAULT NULL              COMMENT '鍒嗙被鍥炬爣',
    `sort_order`    INT          DEFAULT 0                COMMENT '鎺掑簭鍙?,
    `status`        CHAR(1)      DEFAULT '0'              COMMENT '鐘舵€侊紙0=姝ｅ父 1=鍋滅敤锛?,
    `remark`        VARCHAR(500) DEFAULT NULL              COMMENT '澶囨敞',
    `tenant_id`     BIGINT       DEFAULT NULL              COMMENT '绉熸埛ID',
    `create_by`     VARCHAR(64)  DEFAULT NULL              COMMENT '鍒涘缓鑰?,
    `create_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    `update_by`     VARCHAR(64)  DEFAULT NULL              COMMENT '鏇存柊鑰?,
    `update_time`   DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    PRIMARY KEY (`category_id`),
    UNIQUE KEY `uk_category_code` (`category_code`, `tenant_id`),
    KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='娴佺▼鍒嗙被琛?;

-- 3. 琛ㄥ崟瀹氫箟琛?
DROP TABLE IF EXISTS wf_form_definition;
CREATE TABLE wf_form_definition (
  form_id           VARCHAR(64)     NOT NULL COMMENT '琛ㄥ崟ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  form_name         VARCHAR(64)     NOT NULL COMMENT '琛ㄥ崟鍚嶇О',
  form_key          VARCHAR(64)     DEFAULT NULL COMMENT '琛ㄥ崟Key',
  fields_json       LONGTEXT        COMMENT '琛ㄥ崟瀛楁JSON',
  form_schema       LONGTEXT        COMMENT '琛ㄥ崟Schema JSON',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '鐘舵€?,
  version           INT             DEFAULT 1 COMMENT '鐗堟湰鍙?,
  version_lock      INT             DEFAULT 0 COMMENT '涔愯閿佺増鏈彿',
  is_latest         TINYINT(1)      DEFAULT 1 COMMENT '鏄惁鏈€鏂扮増鏈?,
  create_time       DATETIME        DEFAULT NULL COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (form_id),
  KEY idx_form_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='琛ㄥ崟瀹氫箟琛?;

-- =========================================================
-- 浜屻€佹祦绋嬪疄渚嬩笌浠诲姟
-- =========================================================

-- 3. 娴佺▼瀹炰緥琛?
DROP TABLE IF EXISTS wf_process_instance;
CREATE TABLE wf_process_instance (
  instance_id       VARCHAR(64)     NOT NULL COMMENT '瀹炰緥ID (UUID)',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  process_def_key   VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹氫箟Key',
  definition_id     VARCHAR(64)     DEFAULT NULL COMMENT '娴佺▼瀹氫箟ID锛堢増鏈攣瀹氾級',
  business_key      VARCHAR(64)     NOT NULL COMMENT '涓氬姟涓婚敭ID',
  title             VARCHAR(255)    DEFAULT NULL COMMENT '娴佺▼鏍囬',
  start_user_id     BIGINT(20)      NOT NULL COMMENT '鍙戣捣浜篒D',
  start_user_name   VARCHAR(64)     DEFAULT NULL COMMENT '鍙戣捣浜哄鍚?,
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT '鐘舵€?(RUNNING, COMPLETED, CANCELLED, REJECTED, REVOKED, SUSPENDED)',
  start_time        DATETIME        DEFAULT NULL COMMENT '寮€濮嬫椂闂?,
  end_time          DATETIME        DEFAULT NULL COMMENT '缁撴潫鏃堕棿',
  variables         JSON            DEFAULT NULL COMMENT '娴佺▼鍙橀噺(琛ㄥ崟鏁版嵁)',
  priority          VARCHAR(20)     DEFAULT 'NORMAL' COMMENT '浼樺厛绾?,
  process_no        VARCHAR(64)     DEFAULT NULL COMMENT '娴佺▼缂栧彿',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '閮ㄩ棬ID - 鏁版嵁鏉冮檺',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '鍒涘缓鑰?,
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '鏇存柊鑰?,
  create_time       DATETIME        DEFAULT NULL COMMENT '鍒涘缓鏃堕棿',
  update_time       DATETIME        DEFAULT NULL COMMENT '鏇存柊鏃堕棿',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '鍒犻櫎鏍囧織锛?浠ｈ〃瀛樺湪 1浠ｈ〃鍒犻櫎锛?,
  parent_instance_id VARCHAR(64)    DEFAULT NULL COMMENT '鐖舵祦绋嬪疄渚婭D锛堝瓙娴佺▼鍦烘櫙锛屾爣璇嗙敱鍝釜鐖舵祦绋嬪惎鍔級',
  parent_node_key   VARCHAR(64)     DEFAULT NULL COMMENT '鐖舵祦绋嬩腑瑙﹀彂瀛愭祦绋嬬殑鑺傜偣Key锛堝瓙娴佺▼瀹屾垚鍚庡洖璋冪埗娴佺▼鐢級',
  PRIMARY KEY (instance_id),
  KEY idx_start_user (start_user_id),
  KEY idx_business_key (business_key),
  KEY idx_proc_inst_tenant (tenant_id),
  KEY idx_start_user_status (start_user_id, status),
  KEY idx_process_key_status (process_def_key, status),
  KEY idx_start_time (start_time),
  KEY idx_dept_id (dept_id),
  KEY idx_create_by (create_by),
  KEY idx_del_flag (del_flag),
  KEY idx_parent_instance (parent_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宸ヤ綔娴佸疄渚嬭〃';

-- 4. 娴佺▼浠诲姟琛?
DROP TABLE IF EXISTS wf_task;
CREATE TABLE wf_task (
  task_id           VARCHAR(64)     NOT NULL COMMENT '浠诲姟ID (UUID)',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '鑺傜偣Key',
  node_name         VARCHAR(64)     NOT NULL COMMENT '鑺傜偣鍚嶇О',
  assignee          BIGINT(20)      DEFAULT NULL COMMENT '澶勭悊浜篒D',
  assignee_name     VARCHAR(64)     DEFAULT NULL COMMENT '澶勭悊浜哄鍚?,
  proxy_user_id     BIGINT(20)      DEFAULT NULL COMMENT '浠ｇ悊浜篒D',
  candidate_roles   VARCHAR(255)    DEFAULT NULL COMMENT '鍊欓€夎鑹?,
  status            VARCHAR(20)     DEFAULT 'TODO' COMMENT '鐘舵€?(TODO, DONE, SUSPENDED)',
  priority          VARCHAR(20)     DEFAULT 'NORMAL' COMMENT '浼樺厛绾?(NORMAL, URGENT, HIGH)',
  is_timeout        TINYINT(1)      DEFAULT 0 COMMENT '鏄惁瓒呮椂',
  create_time       DATETIME        DEFAULT NULL COMMENT '鍒涘缓鏃堕棿',
  due_time          DATETIME        DEFAULT NULL COMMENT '鎴鏃堕棿',
  PRIMARY KEY (task_id),
  KEY idx_assignee (assignee),
  KEY idx_instance (instance_id),
  KEY idx_task_tenant (tenant_id),
  KEY idx_assignee_status (assignee, status),
  KEY idx_instance_status (instance_id, status),
  KEY idx_status (status),
  KEY idx_create_time (create_time),
  KEY idx_task_composite (assignee, status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宸ヤ綔娴佷换鍔¤〃';

-- 5. 浠诲姟鍘嗗彶琛?
DROP TABLE IF EXISTS wf_task_history;
CREATE TABLE wf_task_history (
  history_id        VARCHAR(64)     NOT NULL COMMENT '鍘嗗彶ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '鍘熶换鍔D',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '鑺傜偣鍚嶇О',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '鑺傜偣Key',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '鎿嶄綔浜篒D',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '鎿嶄綔浜哄鍚?,
  action            VARCHAR(20)     DEFAULT NULL COMMENT '鍔ㄤ綔 (APPROVE, REJECT, RECALL, DELEGATE, COUNTERSIGN_APPROVE, etc.)',
  comment           VARCHAR(500)    DEFAULT NULL COMMENT '瀹℃壒鎰忚',
  duration_seconds  INT             DEFAULT NULL COMMENT '瀹℃壒鑰楁椂(绉?',
  variables_changed TEXT            COMMENT '鍙橀噺鍙樻洿璁板綍(JSON)',
  create_time       DATETIME        DEFAULT NULL COMMENT '鎿嶄綔鏃堕棿',
  PRIMARY KEY (history_id),
  KEY idx_instance_hist (instance_id),
  KEY idx_operator_id (operator_id),
  KEY idx_create_time (create_time),
  KEY idx_instance_create_time (instance_id, create_time),
  KEY idx_operator_create_time (operator_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宸ヤ綔娴佷换鍔″巻鍙茶〃';

-- =========================================================
-- 涓夈€佷换鍔¤緟鍔╁姛鑳?
-- =========================================================

-- 6. 浠诲姟宸茶璁板綍琛?
DROP TABLE IF EXISTS wf_task_read;
CREATE TABLE wf_task_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '浠诲姟ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '鐢ㄦ埛ID',
  read_time         DATETIME        COMMENT '闃呰鏃堕棿',
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_user (task_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浠诲姟宸茶璁板綍琛?;

-- 7. 浠诲姟鍌姙璁板綍琛?
DROP TABLE IF EXISTS wf_task_urge;
CREATE TABLE wf_task_urge (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '浠诲姟ID',
  sender_id         BIGINT(20)      NOT NULL COMMENT '鍌姙浜篒D',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '琚偓鍔炰汉ID',
  reason            VARCHAR(200)    DEFAULT NULL COMMENT '鍌姙鍘熷洜',
  create_time       DATETIME        COMMENT '鍌姙鏃堕棿',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浠诲姟鍌姙璁板綍琛?;

-- 8. 浠诲姟闄勪欢琛?
DROP TABLE IF EXISTS wf_task_attachment;
CREATE TABLE wf_task_attachment (
  attachment_id     VARCHAR(64)     NOT NULL COMMENT '闄勪欢ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '浠诲姟ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
  file_name         VARCHAR(255)    NOT NULL COMMENT '鏂囦欢鍚?,
  file_path         VARCHAR(500)    NOT NULL COMMENT '鏂囦欢璺緞',
  file_size         BIGINT          DEFAULT 0 COMMENT '鏂囦欢澶у皬(瀛楄妭)',
  file_type         VARCHAR(50)     DEFAULT NULL COMMENT '鏂囦欢绫诲瀷',
  upload_user_id    BIGINT(20)      DEFAULT NULL COMMENT '涓婁紶浜篒D',
  upload_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '涓婁紶鏃堕棿',
  PRIMARY KEY (attachment_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浠诲姟闄勪欢琛?;

-- 9. 浠诲姟濮旀淳璁板綍琛?
DROP TABLE IF EXISTS wf_task_delegation;
CREATE TABLE wf_task_delegation (
  delegation_id     VARCHAR(64)     NOT NULL COMMENT '濮旀淳ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '浠诲姟ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
  from_user_id      BIGINT(20)      NOT NULL COMMENT '濮旀淳浜篒D',
  from_user_name    VARCHAR(64)     DEFAULT NULL COMMENT '濮旀淳浜哄悕绉?,
  to_user_id        BIGINT(20)      NOT NULL COMMENT '琚娲句汉ID',
  to_user_name      VARCHAR(64)     DEFAULT NULL COMMENT '琚娲句汉鍚嶇О',
  delegation_type   VARCHAR(20)     DEFAULT 'DELEGATE' COMMENT '绫诲瀷: DELEGATE(濮旀淳)/TRANSFER(杞姙)',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '濮旀淳鍘熷洜',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '鐘舵€?,
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (delegation_id),
  KEY idx_task_id (task_id),
  KEY idx_from_user (from_user_id),
  KEY idx_to_user (to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浠诲姟濮旀淳璁板綍琛?;

-- 10. 浠诲姟鍊欓€変汉琛?
DROP TABLE IF EXISTS wf_task_candidate;
CREATE TABLE wf_task_candidate (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '浠诲姟ID',
  candidate_type    VARCHAR(20)     NOT NULL COMMENT '鍊欓€夌被鍨? USER/ROLE/DEPT',
  candidate_id      VARCHAR(64)     NOT NULL COMMENT '鍊欓€変汉/瑙掕壊/閮ㄩ棬ID',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (id),
  KEY idx_task_id (task_id),
  KEY idx_candidate (candidate_type, candidate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浠诲姟鍊欓€変汉琛?;

-- 11. 鍔犵璁板綍琛?
DROP TABLE IF EXISTS wf_task_add_sign;
CREATE TABLE wf_task_add_sign (
  add_sign_id       VARCHAR(64)     NOT NULL COMMENT '鍔犵ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '鍘熶换鍔D',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '鑺傜偣Key',
  add_sign_type     VARCHAR(20)     DEFAULT 'BEFORE' COMMENT '鍔犵绫诲瀷: BEFORE(鍓嶅姞绛?/AFTER(鍚庡姞绛?',
  from_user_id      BIGINT(20)      NOT NULL COMMENT '鍔犵鍙戣捣浜篒D',
  to_user_id        BIGINT(20)      NOT NULL COMMENT '琚姞绛句汉ID',
  to_user_name      VARCHAR(64)     DEFAULT NULL COMMENT '琚姞绛句汉鍚嶇О',
  new_task_id       VARCHAR(64)     DEFAULT NULL COMMENT '鏂板垱寤虹殑浠诲姟ID',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '鍔犵鍘熷洜',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '鐘舵€?,
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (add_sign_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鍔犵璁板綍琛?;

-- =========================================================
-- 鍥涖€佷細绛惧姛鑳?
-- =========================================================

-- 12. 浼氱浠诲姟琛?
DROP TABLE IF EXISTS wf_countersign_task;
CREATE TABLE wf_countersign_task (
  countersign_id    VARCHAR(64)     NOT NULL COMMENT '浼氱ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '鑺傜偣Key',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '鑺傜偣鍚嶇О',
  sign_type         VARCHAR(20)     NOT NULL COMMENT '浼氱绫诲瀷: ALL/ANY/PERCENT/SEQUENTIAL',
  pass_percent      INT             DEFAULT NULL COMMENT '閫氳繃姣斾緥(鐧惧垎姣?',
  total_count       INT             DEFAULT 0 COMMENT '鎬讳汉鏁?,
  voted_count       INT             DEFAULT 0 COMMENT '宸叉姇绁ㄤ汉鏁?,
  approve_count     INT             DEFAULT 0 COMMENT '鍚屾剰浜烘暟',
  reject_count      INT             DEFAULT 0 COMMENT '鎷掔粷浜烘暟',
  status            VARCHAR(20)     DEFAULT 'VOTING' COMMENT '鐘舵€? VOTING/PASSED/REJECTED',
  assignee_order    TEXT            DEFAULT NULL COMMENT '椤哄簭绛剧讲锛氭湁搴忓鎵逛汉ID鍒楄〃(JSON鏁扮粍)锛屼粎SEQUENTIAL绫诲瀷浣跨敤',
  current_index     INT             DEFAULT NULL COMMENT '椤哄簭绛剧讲锛氬綋鍓嶇缃蹭汉绱㈠紩(浠?寮€濮?锛屼粎SEQUENTIAL绫诲瀷浣跨敤',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  complete_time     DATETIME        DEFAULT NULL COMMENT '瀹屾垚鏃堕棿',
  PRIMARY KEY (countersign_id),
  KEY idx_instance_id (instance_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浼氱浠诲姟琛?;

-- 13. 浼氱鎶曠エ璁板綍琛?
DROP TABLE IF EXISTS wf_countersign_vote;
CREATE TABLE wf_countersign_vote (
  vote_id           VARCHAR(64)     NOT NULL COMMENT '鎶曠エID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  countersign_id    VARCHAR(64)     NOT NULL COMMENT '浼氱浠诲姟ID',
  task_id           VARCHAR(64)     DEFAULT NULL COMMENT '鍏宠仈浠诲姟ID',
  voter_id          BIGINT(20)      NOT NULL COMMENT '鎶曠エ浜篒D',
  voter_name        VARCHAR(64)     DEFAULT NULL COMMENT '鎶曠エ浜哄悕绉?,
  vote_result       VARCHAR(20)     NOT NULL COMMENT '鎶曠エ缁撴灉: APPROVE/REJECT',
  comment           VARCHAR(500)    DEFAULT NULL COMMENT '鎶曠エ鎰忚',
  vote_time         DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鎶曠エ鏃堕棿',
  PRIMARY KEY (vote_id),
  KEY idx_countersign_id (countersign_id),
  KEY idx_voter_id (voter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浼氱鎶曠エ璁板綍琛?;

-- =========================================================
-- 浜斻€佹祦绋嬪揩鐓т笌浜嬪姟娑堟伅
-- =========================================================

-- 14. 娴佺▼瀹炰緥蹇収琛?
DROP TABLE IF EXISTS wf_process_snapshot;
CREATE TABLE wf_process_snapshot (
  snapshot_id       VARCHAR(64)     NOT NULL COMMENT '蹇収ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '鑺傜偣Key',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '鑺傜偣鍚嶇О',
  status            VARCHAR(20)     DEFAULT NULL COMMENT '瀹炰緥鐘舵€?,
  variables         LONGTEXT        COMMENT '娴佺▼鍙橀噺蹇収(JSON)',
  active_tasks      LONGTEXT        COMMENT '娲诲姩浠诲姟蹇収(JSON)',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (snapshot_id),
  KEY idx_instance_id (instance_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='娴佺▼瀹炰緥蹇収琛?;

-- 15. 鑺傜偣鎵ц璁板綍琛紙宸ヤ綔娴佷簨浠堕┍鍔紝鍊熼壌 poco-flow FlowProcessEventListener 璁捐锛?
DROP TABLE IF EXISTS wf_node_record;
CREATE TABLE wf_node_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
  process_def_key   VARCHAR(64)     DEFAULT NULL COMMENT '娴佺▼瀹氫箟Key',
  node_key          VARCHAR(64)     NOT NULL COMMENT '鑺傜偣Key',
  node_name         VARCHAR(128)    DEFAULT NULL COMMENT '鑺傜偣鍚嶇О',
  node_type         VARCHAR(32)     DEFAULT NULL COMMENT '鑺傜偣绫诲瀷: APPROVAL/NOTIFICATION/SCRIPT/TIMER/COPY/MANUAL/CONDITION/PARALLEL/END',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT '鑺傜偣鎵ц鐘舵€? RUNNING/COMPLETED/SKIPPED/FAILED',
  executor_id       BIGINT(20)      DEFAULT NULL COMMENT '鎵ц浜篒D',
  executor_name     VARCHAR(64)     DEFAULT NULL COMMENT '鎵ц浜哄鍚?,
  start_time        DATETIME        DEFAULT NULL COMMENT '鑺傜偣寮€濮嬫椂闂?,
  end_time          DATETIME        DEFAULT NULL COMMENT '鑺傜偣缁撴潫鏃堕棿',
  duration_ms       BIGINT(20)      DEFAULT NULL COMMENT '鎵ц鑰楁椂(姣)',
  extra_data        TEXT            DEFAULT NULL COMMENT '鎵╁睍鏁版嵁(JSON鏍煎紡)',
  event_type        VARCHAR(32)     DEFAULT NULL COMMENT '浜嬩欢绫诲瀷(鍏煎鏃у瓧娈?',
  event_time        DATETIME        DEFAULT NULL COMMENT '浜嬩欢鍙戠敓鏃堕棿(鍏煎鏃у瓧娈?',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '璁板綍鍒涘缓鏃堕棿',
  PRIMARY KEY (id),
  KEY idx_instance_id (instance_id),
  KEY idx_node_key (node_key),
  KEY idx_status (status),
  KEY idx_instance_node_status (instance_id, node_key, status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鑺傜偣鎵ц璁板綍琛紙浜嬩欢椹卞姩锛?;

-- 16. 鏈湴娑堟伅琛紙鍒嗗竷寮忎簨鍔℃渶缁堜竴鑷存€э級
DROP TABLE IF EXISTS wf_transaction_message;
CREATE TABLE wf_transaction_message (
  message_id        VARCHAR(64)     NOT NULL COMMENT '娑堟伅ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  business_type     VARCHAR(50)     NOT NULL COMMENT '涓氬姟绫诲瀷 (PROCESS_START, TASK_COMPLETE, etc.)',
  business_id       VARCHAR(64)     NOT NULL COMMENT '涓氬姟ID',
  content           TEXT            COMMENT '娑堟伅鍐呭(JSON)',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '鐘舵€?(PENDING, PROCESSING, SUCCESS, FAILED)',
  retry_count       INT             DEFAULT 0 COMMENT '閲嶈瘯娆℃暟',
  max_retry_count   INT             DEFAULT 5 COMMENT '鏈€澶ч噸璇曟鏁?,
  next_retry_time   DATETIME        DEFAULT NULL COMMENT '涓嬫閲嶈瘯鏃堕棿',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  error_message     TEXT            COMMENT '閿欒淇℃伅',
  PRIMARY KEY (message_id),
  KEY idx_status_retry (status, next_retry_time, retry_count),
  KEY idx_business (business_type, business_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鏈湴娑堟伅琛紙鍒嗗竷寮忎簨鍔★級';

-- 16. 娴佺▼鍙戝竷璁板綍琛?
DROP TABLE IF EXISTS wf_deploy_record;
CREATE TABLE wf_deploy_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹氫箟ID',
  process_key       VARCHAR(64)     NOT NULL COMMENT '娴佺▼Key',
  version           INT             NOT NULL COMMENT '鐗堟湰鍙?,
  deploy_status     VARCHAR(20)     DEFAULT 'SUCCESS' COMMENT '鍙戝竷鐘舵€?(SUCCESS, FAILED, ROLLBACK)',
  deploy_by         BIGINT(20)      NOT NULL COMMENT '鍙戝竷浜篒D',
  deployer_name     VARCHAR(64)     DEFAULT NULL COMMENT '鍙戝竷浜哄鍚?,
  deploy_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍙戝竷鏃堕棿',
  deploy_note       VARCHAR(500)    DEFAULT NULL COMMENT '鍙戝竷璇存槑',
  change_log        TEXT            COMMENT '鍙樻洿鏃ュ織',
  can_rollback      TINYINT(1)      DEFAULT 1 COMMENT '鏄惁鍙洖婊?,
  rollback_from_version INT         DEFAULT NULL COMMENT '鍥炴粴鑷摢涓増鏈?,
  rollback_reason   VARCHAR(500)    DEFAULT NULL COMMENT '鍥炴粴鍘熷洜',
  rollback_by       BIGINT(20)      DEFAULT NULL COMMENT '鍥炴粴鎿嶄綔浜篒D',
  rollback_time     DATETIME        DEFAULT NULL COMMENT '鍥炴粴鏃堕棿',
  approval_id       BIGINT(20)      DEFAULT NULL COMMENT '鍏宠仈鐨勫鎵笽D',
  deploy_window_id  BIGINT(20)      DEFAULT NULL COMMENT '鍏宠仈鐨勫彂甯冪獥鍙D',
  impact_analysis   TEXT            COMMENT '褰卞搷鍒嗘瀽(JSON鏍煎紡)',
  created_time      DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  updated_time      DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_process_key (process_key),
  KEY idx_version (version),
  KEY idx_deploy_status (deploy_status),
  KEY idx_deploy_time (deploy_time),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='娴佺▼鍙戝竷璁板綍琛?;

-- =========================================================
-- 鍏€侀€氱煡鍔熻兘
-- =========================================================

-- 17. 绯荤粺閫氱煡琛?
DROP TABLE IF EXISTS sys_notice;
CREATE TABLE sys_notice (
  notice_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '鍏憡ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  notice_title      VARCHAR(50)     NOT NULL COMMENT '鍏憡鏍囬',
  notice_type       CHAR(1)         NOT NULL COMMENT '鍏憡绫诲瀷锛?閫氱煡 2鍌姙锛?,
  notice_content    VARCHAR(500)    DEFAULT NULL COMMENT '鍏憡鍐呭',
  sender_id         BIGINT(20)      DEFAULT NULL COMMENT '鍙戦€佽€匢D',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '鎺ユ敹鑰匢D',
  status            CHAR(1)         DEFAULT '0' COMMENT '鍏憡鐘舵€侊紙0鏈 1宸茶锛?,
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '鍒涘缓鑰?,
  create_time       DATETIME        COMMENT '鍒涘缓鏃堕棿',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '鏇存柊鑰?,
  update_time       DATETIME        COMMENT '鏇存柊鏃堕棿',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT '澶囨敞',
  PRIMARY KEY (notice_id)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COMMENT='閫氱煡鍏憡琛?;

-- 18. 閫氱煡鏃ュ織琛?
DROP TABLE IF EXISTS wf_notification_log;
CREATE TABLE wf_notification_log (
  log_id            VARCHAR(64)     NOT NULL COMMENT '鏃ュ織ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  notification_type VARCHAR(20)     NOT NULL COMMENT '閫氱煡绫诲瀷: EMAIL/SMS/WEBSOCKET/WECHAT',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '鎺ユ敹浜篒D',
  recipient_name    VARCHAR(64)     DEFAULT NULL COMMENT '鎺ユ敹浜哄悕绉?,
  title             VARCHAR(200)    DEFAULT NULL COMMENT '閫氱煡鏍囬',
  content           TEXT            COMMENT '閫氱煡鍐呭',
  send_status       VARCHAR(20)     DEFAULT 'PENDING' COMMENT '鍙戦€佺姸鎬? PENDING/SUCCESS/FAILED',
  send_time         DATETIME        DEFAULT NULL COMMENT '鍙戦€佹椂闂?,
  error_message     TEXT            COMMENT '閿欒淇℃伅',
  related_type      VARCHAR(50)     DEFAULT NULL COMMENT '鍏宠仈绫诲瀷 (TASK/PROCESS/DEPLOY)',
  related_id        VARCHAR(64)     DEFAULT NULL COMMENT '鍏宠仈ID',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (log_id),
  KEY idx_recipient (recipient_id),
  KEY idx_send_status (send_status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='閫氱煡鏃ュ織琛?;

-- 19. 閫氱煡閰嶇疆琛?
DROP TABLE IF EXISTS wf_notification_config;
CREATE TABLE wf_notification_config (
  config_id         VARCHAR(64)     NOT NULL COMMENT '閰嶇疆ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  config_name       VARCHAR(100)    NOT NULL COMMENT '閰嶇疆鍚嶇О',
  event_type        VARCHAR(50)     NOT NULL COMMENT '浜嬩欢绫诲瀷 (TASK_CREATED/TASK_COMPLETED/PROCESS_COMPLETED/etc.)',
  notification_type VARCHAR(20)     NOT NULL COMMENT '閫氱煡鏂瑰紡: EMAIL/SMS/WEBSOCKET/WECHAT',
  template_title    VARCHAR(200)    DEFAULT NULL COMMENT '妯℃澘鏍囬',
  template_content  TEXT            COMMENT '妯℃澘鍐呭',
  is_enabled        TINYINT(1)      DEFAULT 1 COMMENT '鏄惁鍚敤',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (config_id),
  KEY idx_event_type (event_type),
  KEY idx_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='閫氱煡閰嶇疆琛?;

-- 20. 鍌姙鏁堟灉缁熻琛?
DROP TABLE IF EXISTS wf_urge_effect;
CREATE TABLE wf_urge_effect (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '浠诲姟ID',
  urge_count        INT             DEFAULT 0 COMMENT '鍌姙娆℃暟',
  first_urge_time   DATETIME        DEFAULT NULL COMMENT '棣栨鍌姙鏃堕棿',
  last_urge_time    DATETIME        DEFAULT NULL COMMENT '鏈€杩戝偓鍔炴椂闂?,
  task_complete_time DATETIME       DEFAULT NULL COMMENT '浠诲姟瀹屾垚鏃堕棿',
  response_seconds  INT             DEFAULT NULL COMMENT '鍝嶅簲鏃堕棿(绉?',
  PRIMARY KEY (id),
  KEY idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鍌姙鏁堟灉缁熻琛?;

-- 21. 娴佺▼鎶勯€佽褰曡〃
DROP TABLE IF EXISTS wf_process_copy;
CREATE TABLE wf_process_copy (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',
  `tenant_id`       BIGINT       DEFAULT NULL            COMMENT '绉熸埛ID',
  `instance_id`     VARCHAR(64)  NOT NULL                COMMENT '娴佺▼瀹炰緥ID',
  `process_def_key` VARCHAR(128) NOT NULL                COMMENT '娴佺▼瀹氫箟Key',
  `title`           VARCHAR(256) DEFAULT NULL            COMMENT '娴佺▼鏍囬',
  `node_id`         VARCHAR(64)  DEFAULT NULL            COMMENT '鎶勯€佽妭鐐笽D',
  `node_name`       VARCHAR(128) DEFAULT NULL            COMMENT '鎶勯€佽妭鐐瑰悕绉?,
  `start_user_id`   BIGINT       DEFAULT NULL            COMMENT '鍙戣捣浜篒D',
  `start_user_name` VARCHAR(64)  DEFAULT NULL            COMMENT '鍙戣捣浜哄鍚?,
  `user_id`         BIGINT       NOT NULL                COMMENT '鎶勯€佹帴鏀朵汉ID',
  `form_data`       TEXT         DEFAULT NULL            COMMENT '琛ㄥ崟鏁版嵁蹇収锛圝SON鏍煎紡锛?,
  `is_read`         TINYINT      NOT NULL DEFAULT 0      COMMENT '鏄惁宸茶锛?-鏈锛?-宸茶',
  `read_time`       DATETIME     DEFAULT NULL            COMMENT '宸茶鏃堕棿',
  `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鎶勯€佹椂闂?,
  PRIMARY KEY (`id`),
  KEY `idx_user_id`     (`user_id`, `is_read`),
  KEY `idx_instance_id` (`instance_id`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='娴佺▼鎶勯€佽褰曡〃';

-- =========================================================
-- 鍒濆鍖栨暟鎹?- 娴佺▼鍒嗙被锛堟爲褰㈢粨鏋勶級
-- =========================================================
INSERT INTO `wf_process_category` (`category_id`, `parent_id`, `category_name`, `category_code`, `icon`, `sort_order`, `status`) VALUES
(1, 0, 'OA鍔炲叕',       'oa',           'Briefcase',    1, '0'),
(2, 0, '浜轰簨绠＄悊',     'hr',           'Users',        2, '0'),
(3, 0, '璐㈠姟绠＄悊',     'finance',      'DollarSign',   3, '0'),
(4, 0, '琛屾斂绠＄悊',     'admin',        'Building',     4, '0'),
(5, 0, '椤圭洰绠＄悊',     'project',      'FolderKanban', 5, '0'),
-- OA鍔炲叕瀛愬垎绫?
(10, 1, '璇峰亣绠＄悊',    'oa_leave',     'Calendar',     1, '0'),
(11, 1, '鍔犵彮绠＄悊',    'oa_overtime',  'Clock',        2, '0'),
(12, 1, '鍑哄樊绠＄悊',    'oa_trip',      'Plane',        3, '0'),
(13, 1, '鑰冨嫟绠＄悊',    'oa_attendance','UserCheck',    4, '0'),
(14, 1, '璁垮绠＄悊',    'oa_visitor',   'UserPlus',     5, '0'),
-- 璐㈠姟绠＄悊瀛愬垎绫?
(20, 3, '鎶ラ攢绠＄悊',    'fin_expense',  'Receipt',      1, '0'),
(21, 3, '浠樻绠＄悊',    'fin_payment',  'CreditCard',   2, '0'),
(22, 3, '棰勭畻绠＄悊',    'fin_budget',   'PieChart',     3, '0'),
-- 琛屾斂绠＄悊瀛愬垎绫?
(30, 4, '杞﹁締绠＄悊',    'adm_vehicle',  'Car',          1, '0'),
(31, 4, '浼氳绠＄悊',    'adm_meeting',  'Video',        2, '0'),
(32, 4, '鍏憡绠＄悊',    'adm_notice',   'Bell',         3, '0');

-- =========================================================
-- 鍒濆鍖栨暟鎹?- 琛ㄥ崟瀹氫箟
-- =========================================================

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_reimburse', '閫氱敤鎶ラ攢鐢宠', '[{"id": "f1", "type": "SELECT", "label": "璐圭敤绫诲瀷", "required": true, "options": ["宸梾璐?, "鎷涘緟璐?, "鍔炲叕璐?, "鍥㈠缓璐?]}, {"id": "f2", "type": "NUMBER", "label": "鎶ラ攢閲戦", "required": true}, {"id": "f3", "type": "DATE", "label": "鍙戠敓鏃ユ湡", "required": true}, {"id": "f4", "type": "TEXTAREA", "label": "璐圭敤鏄庣粏璇存槑", "required": true}]', NOW());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_payment', '瀵瑰叕浠樻鐢宠', '[{"id": "p1", "type": "TEXT", "label": "鏀舵鏂瑰悕绉?, "required": true}, {"id": "p2", "type": "TEXT", "label": "閾惰璐﹀彿", "required": true, "regex": "^\\\\d{10,20}$", "errorMsg": "璇疯緭鍏ユ纭殑閾惰璐﹀彿"}, {"id": "p3", "type": "NUMBER", "label": "浠樻閲戦", "required": true}, {"id": "p4", "type": "TEXT", "label": "鍚堝悓缂栧彿", "required": false}]', NOW());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_leave', '璇峰亣鐢宠鍗?, '[{"id": "l1", "type": "SELECT", "label": "璇峰亣绫诲瀷", "required": true, "options": ["骞村亣", "浜嬪亣", "鐥呭亣", "濠氬亣", "浜у亣"]}, {"id": "l2", "type": "DATE", "label": "寮€濮嬫椂闂?, "required": true}, {"id": "l3", "type": "DATE", "label": "缁撴潫鏃堕棿", "required": true}, {"id": "l4", "type": "NUMBER", "label": "鍏辫澶╂暟", "required": true}, {"id": "l5", "type": "TEXTAREA", "label": "璇峰亣浜嬬敱", "required": true}]', NOW());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_recruit', '浜哄憳鎷涜仒闇€姹?, '[{"id": "r1", "type": "TEXT", "label": "鎷涜仒宀椾綅", "required": true}, {"id": "r2", "type": "NUMBER", "label": "闇€姹備汉鏁?, "required": true}, {"id": "r3", "type": "SELECT", "label": "鏈熸湜鑱岀骇", "required": true, "options": ["P5", "P6", "P7", "P8"]}, {"id": "r4", "type": "TEXTAREA", "label": "宀椾綅鑱岃矗瑕佹眰", "required": true}, {"id": "r5", "type": "NUMBER", "label": "钖祫棰勭畻(k)", "required": true}]', NOW());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_contract', '鍚堝悓瀹℃壒鍗?, '[{"id": "c1", "type": "TEXT", "label": "鍚堝悓鍚嶇О", "required": true}, {"id": "c2", "type": "TEXT", "label": "瀵规柟鍗曚綅", "required": true}, {"id": "c3", "type": "NUMBER", "label": "鍚堝悓閲戦", "required": true}, {"id": "c4", "type": "SELECT", "label": "鍚堝悓绫诲瀷", "required": true, "options": ["閲囪喘鍚堝悓", "閿€鍞悎鍚?, "鏈嶅姟鍗忚"]}, {"id": "c5", "type": "TEXTAREA", "label": "涓昏鏉℃鎽樿", "required": true}]', NOW());

-- =========================================================
-- 鍒濆鍖栨暟鎹?- 娴佺▼瀹氫箟
-- =========================================================

-- 鑺傜偣绾ф寜閽潈闄愯鏄庯細props.buttons 閰嶇疆瀹℃壒鑺傜偣鍙敤鎿嶄綔鎸夐挳
-- 鍙€夊€硷細APPROVE(鍚屾剰), REJECT(鎷掔粷), RETURN(椹冲洖), DELEGATE(杞姙), ADD_SIGN(鍔犵)
-- 鏈厤缃垨涓虹┖鏁扮粍鏃讹紝鍓嶇鏄剧ず鎵€鏈夐粯璁ゆ寜閽紙鍚戝悗鍏煎锛?

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_reimburse', '璐㈠姟鎶ラ攢娴佺▼', 'biz_reimburse', 3, 'PUBLISHED', 1, 'form_reimburse', '{"id": "root", "type": "START", "title": "鎻愪氦鎶ラ攢", "next": {"id": "n1", "type": "APPROVAL", "title": "鐩村睘涓婄骇", "icon": "briefcase", "approverType": "DIRECT_LEADER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "gw1", "type": "CONDITION", "title": "閲戦鏍￠獙", "branches": [{"id": "b1", "type": "APPROVAL", "title": "璐㈠姟涓荤", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount < 1000"}, {"id": "b2", "type": "APPROVAL", "title": "璐㈠姟鎬荤洃", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount >= 1000"}], "next": {"id": "end", "type": "END", "title": "鎵撴"}}}}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_leave', '鍛樺伐璇峰亣娴佺▼', 'biz_leave', 1, 'PUBLISHED', 1, 'form_leave', '{"id": "root", "type": "START", "title": "鎻愪氦璇峰亣", "next": {"id": "n1", "type": "APPROVAL", "title": "閮ㄩ棬缁忕悊", "icon": "briefcase", "approverType": "DEPT_MANAGER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "gw_leave", "type": "CONDITION", "title": "澶╂暟鏍￠獙", "branches": [{"id": "b1", "type": "APPROVAL", "title": "HR澶囨", "icon": "file-box", "approverType": "ROLE", "approverValue": "HR", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "days <= 3"}, {"id": "b2", "type": "APPROVAL", "title": "鎬荤粡鐞嗗鎵?, "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "days > 3"}], "next": {"id": "end", "type": "END", "title": "褰掓。"}}}}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_contract', '鍚堝悓瀹℃壒娴佺▼', 'biz_contract', 5, 'PUBLISHED', 1, 'form_contract', '{"id": "root", "type": "START", "title": "璧疯崏鍚堝悓", "next": {"id": "n1", "type": "APPROVAL", "title": "娉曞姟&璐㈠姟浼氱瀹℃牳", "icon": "scale", "signType": "ALL", "approverType": "USERS", "approverValue": "1", "props": {"buttons": ["APPROVE", "REJECT"]}, "next": {"id": "n2", "type": "APPROVAL", "title": "鎬荤粡鐞嗙鍙?, "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN"]}, "next": {"id": "end", "type": "END", "title": "鐩栫珷褰掓。"}}}}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_recruit', '浜哄憳鎷涜仒娴佺▼', 'biz_recruit', 1, 'PUBLISHED', 1, 'form_recruit', '{"id": "root", "type": "START", "title": "鎻愪氦鎷涜仒闇€姹?, "next": {"id": "n1", "type": "APPROVAL", "title": "閮ㄩ棬鎬荤洃瀹℃壒", "icon": "briefcase", "approverType": "DEPT_MANAGER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "n2", "type": "APPROVAL", "title": "HR瀹℃牳", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "props": {"buttons": ["APPROVE", "REJECT", "DELEGATE"]}, "next": {"id": "n3", "type": "APPROVAL", "title": "鎬荤粡鐞嗗鎵?, "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "next": {"id": "end", "type": "END", "title": "寮€濮嬫嫑鑱?}}}}}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_payment', '瀵瑰叕浠樻娴佺▼', 'biz_payment', 1, 'PUBLISHED', 1, 'form_payment', '{"id": "root", "type": "START", "title": "鎻愪氦浠樻鐢宠", "next": {"id": "n1", "type": "APPROVAL", "title": "璐㈠姟涓荤瀹℃壒", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "RETURN", "DELEGATE"]}, "next": {"id": "gw1", "type": "CONDITION", "title": "閲戦鏍￠獙", "branches": [{"id": "b1", "type": "APPROVAL", "title": "璐㈠姟鎬荤洃瀹℃壒", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount < 50000"}, {"id": "b2", "type": "APPROVAL", "title": "鎬荤粡鐞嗗鎵?, "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount >= 50000"}], "next": {"id": "end", "type": "END", "title": "璐㈠姟鎵撴"}}}}', NOW());

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- OA 妯″潡娴佺▼瀹氫箟锛堣ˉ鍗?澶栧嫟銆佸姞鐝€佹姤閿€銆佽鍋囥€佷粯娆俱€佸嚭宸級
-- =========================================================

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_attendance_appeal', '琛ュ崱/澶栧嫟瀹℃壒娴佺▼', 'attendance_appeal', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "鎻愪氦鐢宠", "next": {"id": "n1", "type": "APPROVAL", "title": "鐩村睘涓婄骇瀹℃壒", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "end", "type": "END", "title": "褰掓。"}}}',
 NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_overtime_request', '鍔犵彮瀹℃壒娴佺▼', 'overtime_request', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "鎻愪氦鍔犵彮鐢宠", "next": {"id": "n1", "type": "APPROVAL", "title": "鐩村睘涓婄骇瀹℃壒", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "n2", "type": "APPROVAL", "title": "HR澶囨", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "end", "type": "END", "title": "褰掓。"}}}}',
 NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_expense_claim', '鎶ラ攢瀹℃壒娴佺▼', 'expense_claim', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "鎻愪氦鎶ラ攢", "next": {"id": "n1", "type": "APPROVAL", "title": "鐩村睘涓婄骇瀹℃壒", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "n2", "type": "APPROVAL", "title": "璐㈠姟瀹℃牳", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "next": {"id": "end", "type": "END", "title": "鎵撴"}}}}',
 NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_leave_request', '璇峰亣瀹℃壒娴佺▼', 'leave_request', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "鎻愪氦璇峰亣", "next": {"id": "n1", "type": "APPROVAL", "title": "閮ㄩ棬缁忕悊瀹℃壒", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "n2", "type": "APPROVAL", "title": "HR澶囨", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "end", "type": "END", "title": "褰掓。"}}}}',
 NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_payment_request', '浠樻瀹℃壒娴佺▼', 'payment_request', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "鎻愪氦浠樻鐢宠", "next": {"id": "n1", "type": "APPROVAL", "title": "璐㈠姟涓荤瀹℃壒", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "next": {"id": "gw1", "type": "CONDITION", "title": "閲戦鏍￠獙", "branches": [{"id": "b1", "type": "APPROVAL", "title": "璐㈠姟鎬荤洃瀹℃壒", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount < 50000"}, {"id": "b2", "type": "APPROVAL", "title": "鎬荤粡鐞嗗鎵?, "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "condition": "amount >= 50000"}], "next": {"id": "end", "type": "END", "title": "璐㈠姟鎵撴"}}}}',
 NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_business_trip', '鍑哄樊瀹℃壒娴佺▼', 'business_trip', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "鎻愪氦鍑哄樊鐢宠", "next": {"id": "n1", "type": "APPROVAL", "title": "閮ㄩ棬缁忕悊瀹℃壒", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "n2", "type": "APPROVAL", "title": "HR澶囨", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "end", "type": "END", "title": "褰掓。"}}}}',
 NOW());

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 娴嬭瘯鏁版嵁
-- 鐢ㄤ簬寮€鍙戝拰娴嬭瘯鐜
-- =========================================================

-- 鎻掑叆娴嬭瘯娴佺▼瀹炰緥
INSERT INTO wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key, 
  title, start_user_id, start_user_name, status, start_time, variables, priority
) VALUES 
('test_inst_001', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_001',
 '寮犱笁鐨勫樊鏃呰垂鎶ラ攢', 1, '寮犱笁', 'RUNNING', NOW(),
 '{"f1": "宸梾璐?, "f2": 1500, "f3": "2026-02-08", "f4": "鍖椾含鍑哄樊寰€杩旀満绁ㄥ強浣忓璐圭敤"}', 'NORMAL'),

('test_inst_002', 100000, 'biz_leave', 'wf_leave', 'BIZ_002',
 '鏉庡洓鐨勫勾鍋囩敵璇?, 2, '鏉庡洓', 'RUNNING', NOW(),
 '{"l1": "骞村亣", "l2": "2026-02-15", "l3": "2026-02-20", "l4": 5, "l5": "鏄ヨ妭鍚庝紤鍋?}', 'NORMAL'),

('test_inst_003', 100000, 'biz_contract', 'wf_contract', 'BIZ_003',
 '鐜嬩簲鐨勯攢鍞悎鍚屽鎵?, 3, '鐜嬩簲', 'RUNNING', NOW(),
 '{"c1": "XX鍏徃杞欢閲囪喘鍚堝悓", "c2": "XX绉戞妧鏈夐檺鍏徃", "c3": 50000, "c4": "閿€鍞悎鍚?, "c5": "杞欢鎺堟潈鍙婃妧鏈敮鎸佹湇鍔?}', 'HIGH'),

('test_inst_004', 100000, 'biz_payment', 'wf_payment', 'BIZ_004',
 '璧靛叚鐨勫鍏粯娆剧敵璇?, 4, '璧靛叚', 'RUNNING', NOW(),
 '{"p1": "渚涘簲鍟咥鍏徃", "p2": "1234567890123456", "p3": 30000, "p4": "HT-2026-001"}', 'NORMAL'),

('test_inst_005', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_005',
 '寮犱笁鐨勫姙鍏垂鎶ラ攢', 1, '寮犱笁', 'RUNNING', NOW(),
 '{"f1": "鍔炲叕璐?, "f2": 500, "f3": "2026-02-05", "f4": "璐拱鍔炲叕鐢ㄥ搧"}', 'NORMAL'),

('test_inst_006', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_006',
 '瀛欎竷鐨勬嫑寰呰垂鎶ラ攢', 2, '瀛欎竷', 'RUNNING', NOW(),
 '{"f1": "鎷涘緟璐?, "f2": 2500, "f3": "2026-02-09", "f4": "瀹㈡埛鍟嗗姟瀹磋"}', 'URGENT'),

('test_inst_007', 100000, 'biz_leave', 'wf_leave', 'BIZ_007',
 '鍛ㄥ叓鐨勭梾鍋囩敵璇?, 3, '鍛ㄥ叓', 'RUNNING', NOW(),
 '{"l1": "鐥呭亣", "l2": "2026-02-11", "l3": "2026-02-13", "l4": 2, "l5": "鎰熷啋鍙戠儳闇€瑕佷紤鎭?}', 'URGENT'),

('test_inst_008', 100000, 'biz_recruit', 'wf_recruit', 'BIZ_008',
 '鍚翠節鐨勬嫑鑱橀渶姹?, 1, '鍚翠節', 'RUNNING', NOW(),
 '{"r1": "楂樼骇Java寮€鍙戝伐绋嬪笀", "r2": 2, "r3": "P7", "r4": "璐熻矗鏍稿績涓氬姟绯荤粺寮€鍙?, "r5": 35}', 'HIGH'),

('test_inst_009', 100000, 'biz_contract', 'wf_contract', 'BIZ_009',
 '閮戝崄鐨勯噰璐悎鍚屽鎵?, 4, '閮戝崄', 'RUNNING', NOW(),
 '{"c1": "鍔炲叕璁惧閲囪喘鍚堝悓", "c2": "YY绉戞妧鏈夐檺鍏徃", "c3": 80000, "c4": "閲囪喘鍚堝悓", "c5": "閲囪喘鍔炲叕鐢佃剳銆佹墦鍗版満绛夎澶?}', 'NORMAL'),

('test_inst_010', 100000, 'biz_leave', 'wf_leave', 'BIZ_010',
 '閽卞崄涓€鐨勫鍋囩敵璇?, 2, '閽卞崄涓€', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY),
 '{"l1": "濠氬亣", "l2": "2026-02-01", "l3": "2026-02-05", "l4": 5, "l5": "缁撳搴﹁湝鏈?}', 'NORMAL');

-- 鎻掑叆 test_inst_005 鐨勫緟鍔炰换鍔★紙淇"寰呰棰?闂锛?
INSERT INTO wf_task (
  task_id, tenant_id, instance_id, node_key, node_name,
  assignee, assignee_name, status, priority, create_time, due_time
) VALUES 
('test_task_011', 100000, 'test_inst_005', 'gw1_b1', '璐㈠姟涓荤瀹℃壒',
 1, '绠＄悊鍛?, 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 2 DAY));

-- 鏇存柊宸插畬鎴愭祦绋嬬殑缁撴潫鏃堕棿
UPDATE wf_process_instance SET end_time = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE instance_id = 'test_inst_010';

-- 鎻掑叆娴嬭瘯寰呭姙浠诲姟
INSERT INTO wf_task (
  task_id, tenant_id, instance_id, node_key, node_name,
  assignee, assignee_name, status, priority, create_time, due_time
) VALUES 
('test_task_001', 100000, 'test_inst_001', 'n1', '鐩村睘涓婄骇瀹℃壒',
 1, '绠＄悊鍛?, 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 2 DAY)),

('test_task_002', 100000, 'test_inst_002', 'n1', '閮ㄩ棬缁忕悊瀹℃壒',
 1, '绠＄悊鍛?, 'TODO', 'URGENT', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)),

('test_task_003', 100000, 'test_inst_003', 'n1', '娉曞姟&璐㈠姟浼氱瀹℃牳',
 1, '绠＄悊鍛?, 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_004', 100000, 'test_inst_003', 'n1', '娉曞姟&璐㈠姟浼氱瀹℃牳',
 1, '绠＄悊鍛?, 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_005', 100000, 'test_inst_004', 'n1', '璐㈠姟涓荤瀹℃壒',
 1, '绠＄悊鍛?, 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 2 DAY)),

('test_task_006', 100000, 'test_inst_006', 'n1', '鐩村睘涓婄骇瀹℃壒',
 1, '绠＄悊鍛?, 'TODO', 'URGENT', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)),

('test_task_007', 100000, 'test_inst_007', 'n1', '閮ㄩ棬缁忕悊瀹℃壒',
 1, '绠＄悊鍛?, 'TODO', 'URGENT', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)),

('test_task_008', 100000, 'test_inst_008', 'n1', '閮ㄩ棬鎬荤洃瀹℃壒',
 1, '绠＄悊鍛?, 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_009', 100000, 'test_inst_009', 'n1', '娉曞姟&璐㈠姟浼氱瀹℃牳',
 1, '绠＄悊鍛?, 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 4 DAY)),

('test_task_010', 100000, 'test_inst_009', 'n1', '娉曞姟&璐㈠姟浼氱瀹℃牳',
 1, '绠＄悊鍛?, 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 4 DAY));

-- 鎻掑叆浼氱浠诲姟璁板綍锛堝悎鍚屽鎵规祦绋嬬殑浼氱鑺傜偣 n1锛?
INSERT INTO wf_countersign_task (
  countersign_id, tenant_id, instance_id, node_key, node_name,
  sign_type, total_count, voted_count, approve_count, reject_count, status, create_time
) VALUES
('cs_inst_003', 100000, 'test_inst_003', 'n1', '娉曞姟&璐㈠姟浼氱瀹℃牳',
 'ALL', 2, 0, 0, 0, 'VOTING', NOW()),
('cs_inst_009', 100000, 'test_inst_009', 'n1', '娉曞姟&璐㈠姟浼氱瀹℃牳',
 'ALL', 2, 0, 0, 0, 'VOTING', NOW());

-- 鎻掑叆浠诲姟鍘嗗彶璁板綍
INSERT INTO wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key,
  operator_id, operator_name, action, comment, duration_seconds, create_time
) VALUES 
('test_hist_001', 100000, 'test_task_completed_001', 'test_inst_005', '鐩村睘涓婄骇瀹℃壒', 'n1',
 1, '绠＄悊鍛?, 'APPROVE', '鍚屾剰鎶ラ攢', 300, DATE_SUB(NOW(), INTERVAL 1 DAY)),

('test_hist_002', 100000, 'test_task_completed_002', 'test_inst_005', '璐㈠姟涓荤瀹℃壒', 'n2',
 1, '绠＄悊鍛?, 'APPROVE', '宸叉墦娆?, 600, DATE_SUB(NOW(), INTERVAL 1 DAY)),

('test_hist_003', 100000, 'test_task_completed_003', 'test_inst_010', '閮ㄩ棬缁忕悊瀹℃壒', 'n1',
 1, '绠＄悊鍛?, 'APPROVE', '鍚屾剰璇峰亣', 180, DATE_SUB(NOW(), INTERVAL 4 DAY)),

('test_hist_004', 100000, 'test_task_completed_004', 'test_inst_010', 'HR澶囨', 'b1',
 1, '绠＄悊鍛?, 'APPROVE', '宸插妗?, 120, DATE_SUB(NOW(), INTERVAL 3 DAY));

-- 鎻掑叆娴佺▼鎶勯€佹祴璇曟暟鎹紙鎺ユ敹浜轰负 admin, user_id=1锛?
INSERT INTO wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name,
  start_user_id, start_user_name, user_id, form_data, is_read, read_time, create_time
) VALUES
-- 鏉庡洓鐨勫勾鍋囩敵璇?鈫?鎶勯€佺粰admin锛堟湭璇伙級
(100000, 'test_inst_002', 'biz_leave', '鏉庡洓鐨勫勾鍋囩敵璇?, 'n1', '閮ㄩ棬缁忕悊瀹℃壒',
 2, '鏉庡洓', 1,
 '{"l1":"骞村亣","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"鏄ヨ妭鍚庝紤鍋?}',
 0, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR)),

-- 鐜嬩簲鐨勯攢鍞悎鍚屽鎵?鈫?鎶勯€佺粰admin锛堟湭璇伙級
(100000, 'test_inst_003', 'biz_contract', '鐜嬩簲鐨勯攢鍞悎鍚屽鎵?, 'n1', '娉曞姟&璐㈠姟浼氱瀹℃牳',
 3, '鐜嬩簲', 1,
 '{"c1":"XX鍏徃杞欢閲囪喘鍚堝悓","c2":"XX绉戞妧鏈夐檺鍏徃","c3":50000,"c4":"閿€鍞悎鍚?,"c5":"杞欢鎺堟潈鍙婃妧鏈敮鎸佹湇鍔?}',
 0, NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR)),

-- 璧靛叚鐨勫鍏粯娆剧敵璇?鈫?鎶勯€佺粰admin锛堟湭璇伙級
(100000, 'test_inst_004', 'biz_payment', '璧靛叚鐨勫鍏粯娆剧敵璇?, 'n1', '璐㈠姟涓荤瀹℃壒',
 4, '璧靛叚', 1,
 '{"p1":"渚涘簲鍟咥鍏徃","p2":"1234567890123456","p3":30000,"p4":"HT-2026-001"}',
 0, NULL, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),

-- 瀛欎竷鐨勬嫑寰呰垂鎶ラ攢 鈫?鎶勯€佺粰admin锛堝凡璇伙級
(100000, 'test_inst_006', 'biz_reimburse', '瀛欎竷鐨勬嫑寰呰垂鎶ラ攢', 'n1', '鐩村睘涓婄骇瀹℃壒',
 2, '瀛欎竷', 1,
 '{"f1":"鎷涘緟璐?,"f2":2500,"f3":"2026-02-09","f4":"瀹㈡埛鍟嗗姟瀹磋"}',
 1, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 1 DAY)),

-- 鍛ㄥ叓鐨勭梾鍋囩敵璇?鈫?鎶勯€佺粰admin锛堝凡璇伙級
(100000, 'test_inst_007', 'biz_leave', '鍛ㄥ叓鐨勭梾鍋囩敵璇?, 'n1', '閮ㄩ棬缁忕悊瀹℃壒',
 3, '鍛ㄥ叓', 1,
 '{"l1":"鐥呭亣","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"鎰熷啋鍙戠儳闇€瑕佷紤鎭?}',
 1, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 1 DAY)),

-- 閮戝崄鐨勯噰璐悎鍚屽鎵?鈫?鎶勯€佺粰admin锛堝凡璇伙級
(100000, 'test_inst_009', 'biz_contract', '閮戝崄鐨勯噰璐悎鍚屽鎵?, 'n1', '娉曞姟&璐㈠姟浼氱瀹℃牳',
 4, '閮戝崄', 1,
 '{"c1":"鍔炲叕璁惧閲囪喘鍚堝悓","c2":"YY绉戞妧鏈夐檺鍏徃","c3":80000,"c4":"閲囪喘鍚堝悓","c5":"閲囪喘鍔炲叕鐢佃剳銆佹墦鍗版満绛夎澶?}',
 1, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),

-- 閽卞崄涓€鐨勫鍋囩敵璇凤紙宸插畬鎴愭祦绋嬶級鈫?鎶勯€佺粰admin锛堝凡璇伙級
(100000, 'test_inst_010', 'biz_leave', '閽卞崄涓€鐨勫鍋囩敵璇?, 'b1', 'HR澶囨',
 2, '閽卞崄涓€', 1,
 '{"l1":"濠氬亣","l2":"2026-02-01","l3":"2026-02-05","l4":5,"l5":"缁撳搴﹁湝鏈?}',
 1, DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY));

-- =========================================================
-- 涓冦€佹祦绋嬫墽琛岀洃鎺э紙Phase 2: 鎬ц兘涓庣洃鎺э級
-- =========================================================

-- 22. 娴佺▼鎵ц鐩戞帶琛?
DROP TABLE IF EXISTS wf_process_monitor;
CREATE TABLE wf_process_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
    process_def_id    VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹氫箟ID',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹氫箟Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '娴佺▼瀹氫箟鍚嶇О',
    business_key      VARCHAR(100)    DEFAULT NULL COMMENT '涓氬姟閿?,
    start_time        DATETIME        NOT NULL COMMENT '寮€濮嬫椂闂?,
    end_time          DATETIME        DEFAULT NULL COMMENT '缁撴潫鏃堕棿',
    duration          BIGINT(20)      DEFAULT NULL COMMENT '鎵ц鏃堕暱(姣)',
    status            VARCHAR(20)     NOT NULL COMMENT '鐘舵€侊細RUNNING/COMPLETED/FAILED/TERMINATED',
    node_count        INT(11)         DEFAULT 0 COMMENT '宸叉墽琛岃妭鐐规暟閲?,
    task_count        INT(11)         DEFAULT 0 COMMENT '宸插畬鎴愪换鍔℃暟閲?,
    error_message     TEXT            DEFAULT NULL COMMENT '閿欒淇℃伅',
    start_user_id     BIGINT(20)      DEFAULT NULL COMMENT '鍙戣捣浜篒D',
    start_user_name   VARCHAR(50)     DEFAULT NULL COMMENT '鍙戣捣浜哄鍚?,
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    PRIMARY KEY (id),
    UNIQUE KEY uk_instance (instance_id),
    KEY idx_tenant (tenant_id),
    KEY idx_process_def (process_def_key),
    KEY idx_status (status),
    KEY idx_start_time (start_time),
    KEY idx_duration (duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='娴佺▼鎵ц鐩戞帶琛?;

-- 23. 鑺傜偣鎵ц鐩戞帶琛?
DROP TABLE IF EXISTS wf_node_monitor;
CREATE TABLE wf_node_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
    node_id           VARCHAR(64)     NOT NULL COMMENT '鑺傜偣ID',
    node_key          VARCHAR(64)     NOT NULL COMMENT '鑺傜偣Key',
    node_name         VARCHAR(100)    NOT NULL COMMENT '鑺傜偣鍚嶇О',
    node_type         VARCHAR(20)     NOT NULL COMMENT '鑺傜偣绫诲瀷',
    start_time        DATETIME        NOT NULL COMMENT '寮€濮嬫椂闂?,
    end_time          DATETIME        DEFAULT NULL COMMENT '缁撴潫鏃堕棿',
    duration          BIGINT(20)      DEFAULT NULL COMMENT '鎵ц鏃堕暱(姣)',
    status            VARCHAR(20)     NOT NULL COMMENT '鐘舵€侊細RUNNING/COMPLETED/FAILED/SKIPPED',
    error_message     TEXT            DEFAULT NULL COMMENT '閿欒淇℃伅',
    retry_count       INT(11)         DEFAULT 0 COMMENT '閲嶈瘯娆℃暟',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_instance (instance_id),
    KEY idx_node (node_key),
    KEY idx_status (status),
    KEY idx_start_time (start_time),
    KEY idx_duration (duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鑺傜偣鎵ц鐩戞帶琛?;

-- 24. 浠诲姟鎵ц鐩戞帶琛?
DROP TABLE IF EXISTS wf_task_monitor;
CREATE TABLE wf_task_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
    task_id           VARCHAR(64)     NOT NULL COMMENT '浠诲姟ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
    node_key          VARCHAR(64)     NOT NULL COMMENT '鑺傜偣Key',
    task_name         VARCHAR(100)    NOT NULL COMMENT '浠诲姟鍚嶇О',
    assignee_id       BIGINT(20)      DEFAULT NULL COMMENT '澶勭悊浜篒D',
    assignee_name     VARCHAR(50)     DEFAULT NULL COMMENT '澶勭悊浜哄鍚?,
    create_time_task  DATETIME        NOT NULL COMMENT '浠诲姟鍒涘缓鏃堕棿',
    claim_time        DATETIME        DEFAULT NULL COMMENT '璁ら鏃堕棿',
    complete_time     DATETIME        DEFAULT NULL COMMENT '瀹屾垚鏃堕棿',
    wait_duration     BIGINT(20)      DEFAULT NULL COMMENT '绛夊緟鏃堕暱(姣)',
    handle_duration   BIGINT(20)      DEFAULT NULL COMMENT '澶勭悊鏃堕暱(姣)',
    total_duration    BIGINT(20)      DEFAULT NULL COMMENT '鎬绘椂闀?姣)',
    status            VARCHAR(20)     NOT NULL COMMENT '鐘舵€侊細PENDING/CLAIMED/COMPLETED/TIMEOUT',
    action            VARCHAR(20)     DEFAULT NULL COMMENT '鎿嶄綔锛欰PPROVE/REJECT/TRANSFER/DELEGATE',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    PRIMARY KEY (id),
    UNIQUE KEY uk_task (task_id),
    KEY idx_tenant (tenant_id),
    KEY idx_instance (instance_id),
    KEY idx_assignee (assignee_id),
    KEY idx_status (status),
    KEY idx_create_time (create_time_task),
    KEY idx_total_duration (total_duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浠诲姟鎵ц鐩戞帶琛?;

-- =========================================================
-- 鍏€佽秴鏃跺憡璀?
-- =========================================================

-- 25. 瓒呮椂鍛婅璁板綍琛?
DROP TABLE IF EXISTS wf_timeout_alert;
CREATE TABLE wf_timeout_alert (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
    alert_type        VARCHAR(20)     NOT NULL COMMENT '鍛婅绫诲瀷锛歍ASK/PROCESS',
    target_id         VARCHAR(64)     NOT NULL COMMENT '鐩爣ID锛堜换鍔D鎴栨祦绋嬪疄渚婭D锛?,
    target_name       VARCHAR(100)    NOT NULL COMMENT '鐩爣鍚嶇О',
    timeout_level     VARCHAR(20)     NOT NULL COMMENT '瓒呮椂绾у埆锛歊EMIND/WARNING/CRITICAL',
    timeout_duration  BIGINT(20)      NOT NULL COMMENT '瓒呮椂鏃堕暱(姣)',
    threshold         BIGINT(20)      NOT NULL COMMENT '闃堝€?姣)',
    assignee_id       BIGINT(20)      DEFAULT NULL COMMENT '澶勭悊浜篒D',
    assignee_name     VARCHAR(50)     DEFAULT NULL COMMENT '澶勭悊浜哄鍚?,
    alert_time        DATETIME        NOT NULL COMMENT '鍛婅鏃堕棿',
    notification_sent CHAR(1)         DEFAULT 'N' COMMENT '鏄惁宸插彂閫侀€氱煡锛圷鏄?N鍚︼級',
    escalated         CHAR(1)         DEFAULT 'N' COMMENT '鏄惁宸插崌绾э紙Y鏄?N鍚︼級',
    resolved          CHAR(1)         DEFAULT 'N' COMMENT '鏄惁宸茶В鍐筹紙Y鏄?N鍚︼級',
    resolve_time      DATETIME        DEFAULT NULL COMMENT '瑙ｅ喅鏃堕棿',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_alert_type (alert_type),
    KEY idx_target (target_id),
    KEY idx_timeout_level (timeout_level),
    KEY idx_assignee (assignee_id),
    KEY idx_alert_time (alert_time),
    KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='瓒呮椂鍛婅璁板綍琛?;

-- =========================================================
-- 涔濄€佸紓甯告娴?
-- =========================================================

-- 26. 寮傚父娴佺▼璁板綍琛?
DROP TABLE IF EXISTS wf_anomaly_alert;
CREATE TABLE wf_anomaly_alert (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
    anomaly_type      VARCHAR(30)     NOT NULL COMMENT '寮傚父绫诲瀷锛欵XECUTION_FAILED/DEADLOCK/INFINITE_LOOP/NO_ASSIGNEE/PERMISSION_ERROR/DATA_INCONSISTENCY',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹炰緥ID',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹氫箟Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '娴佺▼瀹氫箟鍚嶇О',
    node_key          VARCHAR(64)     DEFAULT NULL COMMENT '鑺傜偣Key',
    node_name         VARCHAR(100)    DEFAULT NULL COMMENT '鑺傜偣鍚嶇О',
    task_id           VARCHAR(64)     DEFAULT NULL COMMENT '浠诲姟ID',
    error_message     TEXT            DEFAULT NULL COMMENT '閿欒淇℃伅',
    stack_trace       TEXT            DEFAULT NULL COMMENT '鍫嗘爤璺熻釜',
    severity          VARCHAR(20)     NOT NULL COMMENT '涓ラ噸绋嬪害锛歀OW/MEDIUM/HIGH/CRITICAL',
    alert_time        DATETIME        NOT NULL COMMENT '鍛婅鏃堕棿',
    notification_sent CHAR(1)         DEFAULT 'N' COMMENT '鏄惁宸插彂閫侀€氱煡锛圷鏄?N鍚︼級',
    resolved          CHAR(1)         DEFAULT 'N' COMMENT '鏄惁宸茶В鍐筹紙Y鏄?N鍚︼級',
    resolve_time      DATETIME        DEFAULT NULL COMMENT '瑙ｅ喅鏃堕棿',
    resolve_note      TEXT            DEFAULT NULL COMMENT '瑙ｅ喅璇存槑',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_anomaly_type (anomaly_type),
    KEY idx_instance (instance_id),
    KEY idx_process_def (process_def_key),
    KEY idx_severity (severity),
    KEY idx_alert_time (alert_time),
    KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='寮傚父娴佺▼璁板綍琛?;

-- =========================================================
-- 鍗併€佺洃鎺х粺璁?
-- =========================================================

-- 27. 娴佺▼鎬ц兘缁熻琛紙鎸夊ぉ姹囨€伙級
DROP TABLE IF EXISTS wf_performance_stats;
CREATE TABLE wf_performance_stats (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
    stat_date         DATE            NOT NULL COMMENT '缁熻鏃ユ湡',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹氫箟Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '娴佺▼瀹氫箟鍚嶇О',
    total_count       INT(11)         DEFAULT 0 COMMENT '鎬绘祦绋嬫暟',
    completed_count   INT(11)         DEFAULT 0 COMMENT '瀹屾垚鏁?,
    failed_count      INT(11)         DEFAULT 0 COMMENT '澶辫触鏁?,
    avg_duration      BIGINT(20)      DEFAULT 0 COMMENT '骞冲潎鎵ц鏃堕暱(姣)',
    max_duration      BIGINT(20)      DEFAULT 0 COMMENT '鏈€澶ф墽琛屾椂闀?姣)',
    min_duration      BIGINT(20)      DEFAULT 0 COMMENT '鏈€灏忔墽琛屾椂闀?姣)',
    timeout_count     INT(11)         DEFAULT 0 COMMENT '瓒呮椂鏁?,
    anomaly_count     INT(11)         DEFAULT 0 COMMENT '寮傚父鏁?,
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    PRIMARY KEY (id),
    UNIQUE KEY uk_stat (tenant_id, stat_date, process_def_key),
    KEY idx_tenant (tenant_id),
    KEY idx_stat_date (stat_date),
    KEY idx_process_def (process_def_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='娴佺▼鎬ц兘缁熻琛?;

-- =========================================================
-- 鍗佷竴銆佸彂甯冨寮哄姛鑳斤紙Phase 1锛?
-- =========================================================

-- 28. 鍙戝竷绐楀彛閰嶇疆琛?
DROP TABLE IF EXISTS wf_deploy_window;
CREATE TABLE wf_deploy_window (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  window_name       VARCHAR(100)    NOT NULL COMMENT '绐楀彛鍚嶇О',
  window_type       VARCHAR(20)     NOT NULL COMMENT '绐楀彛绫诲瀷锛欴AILY/WEEKLY/MONTHLY/CUSTOM',
  start_time        TIME            NOT NULL COMMENT '寮€濮嬫椂闂?,
  end_time          TIME            NOT NULL COMMENT '缁撴潫鏃堕棿',
  week_days         VARCHAR(50)     DEFAULT NULL COMMENT '鏄熸湡鍑狅紙WEEKLY绫诲瀷浣跨敤锛岄€楀彿鍒嗛殧锛?,2,3,4,5锛?,
  month_days        VARCHAR(100)    DEFAULT NULL COMMENT '姣忔湀鍑犲彿锛圡ONTHLY绫诲瀷浣跨敤锛岄€楀彿鍒嗛殧锛?,15,30锛?,
  custom_dates      TEXT            DEFAULT NULL COMMENT '鑷畾涔夋棩鏈燂紙CUSTOM绫诲瀷浣跨敤锛孞SON鏍煎紡瀛樺偍鏃ユ湡鍒楄〃锛?,
  is_enabled        TINYINT(1)      DEFAULT 1 COMMENT '鏄惁鍚敤',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '鎻忚堪',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '鍒涘缓鑰?,
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '鏇存柊鑰?,
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (id),
  KEY idx_tenant (tenant_id),
  KEY idx_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鍙戝竷绐楀彛閰嶇疆琛?;

-- 29. 鍙戝竷閫氱煡琛?
DROP TABLE IF EXISTS wf_deploy_notification;
CREATE TABLE wf_deploy_notification (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  deploy_id         BIGINT(20)      NOT NULL COMMENT '鍙戝竷璁板綍ID',
  notification_type VARCHAR(20)     NOT NULL COMMENT '閫氱煡绫诲瀷锛欵MAIL/SMS/WEBSOCKET/WECHAT',
  recipient_type    VARCHAR(20)     NOT NULL COMMENT '鎺ユ敹浜虹被鍨嬶細USER/ROLE/DEPT',
  recipient_value   VARCHAR(500)    NOT NULL COMMENT '鎺ユ敹浜哄€硷紙ID鍒楄〃锛岄€楀彿鍒嗛殧锛?,
  title             VARCHAR(200)    DEFAULT NULL COMMENT '閫氱煡鏍囬',
  content           TEXT            DEFAULT NULL COMMENT '閫氱煡鍐呭',
  send_status       VARCHAR(20)     DEFAULT 'PENDING' COMMENT '鍙戦€佺姸鎬侊細PENDING/SUCCESS/FAILED',
  send_time         DATETIME        DEFAULT NULL COMMENT '鍙戦€佹椂闂?,
  error_message     TEXT            COMMENT '閿欒淇℃伅',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_send_status (send_status),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鍙戝竷閫氱煡琛?;

-- 30. 鍙戝竷瀹℃壒娴佺▼琛?
DROP TABLE IF EXISTS wf_deploy_approval;
CREATE TABLE wf_deploy_approval (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  deploy_id         BIGINT(20)      NOT NULL COMMENT '鍙戝竷璁板綍ID',
  submitter_id      BIGINT(20)      NOT NULL COMMENT '鎻愪氦浜篒D',
  submitter_name    VARCHAR(64)     DEFAULT NULL COMMENT '鎻愪氦浜哄鍚?,
  approval_status   VARCHAR(20)     DEFAULT 'PENDING' COMMENT '瀹℃壒鐘舵€侊細PENDING/APPROVED/REJECTED/CANCELLED',
  current_step      INT             DEFAULT 1 COMMENT '褰撳墠姝ラ',
  total_steps       INT             DEFAULT 1 COMMENT '鎬绘楠ゆ暟',
  start_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '寮€濮嬫椂闂?,
  end_time          DATETIME        DEFAULT NULL COMMENT '缁撴潫鏃堕棿',
  submit_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鎻愪氦鏃堕棿',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '鍒涘缓鑰?,
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_submitter_id (submitter_id),
  KEY idx_approval_status (approval_status),
  KEY idx_tenant_id (tenant_id),
  KEY idx_submit_time (submit_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鍙戝竷瀹℃壒娴佺▼琛?;

-- 31. 瀹℃壒姝ラ琛?
DROP TABLE IF EXISTS wf_deploy_approval_step;
CREATE TABLE wf_deploy_approval_step (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  approval_id       BIGINT(20)      NOT NULL COMMENT '瀹℃壒娴佺▼ID',
  step_no           INT             NOT NULL COMMENT '姝ラ搴忓彿',
  step_name         VARCHAR(100)    DEFAULT NULL COMMENT '姝ラ鍚嶇О',
  approver_type     VARCHAR(20)     NOT NULL COMMENT '瀹℃壒浜虹被鍨嬶細USER/ROLE/DEPT',
  approver_value    VARCHAR(500)    NOT NULL COMMENT '瀹℃壒浜哄€硷紙ID鍒楄〃锛?,
  approver_ids      VARCHAR(500)    NOT NULL COMMENT '瀹℃壒浜篒D鍒楄〃锛堥€楀彿鍒嗛殧锛岀敤浜嶧IND_IN_SET鏌ヨ锛?,
  approval_mode     VARCHAR(20)     DEFAULT 'ANY' COMMENT '瀹℃壒妯″紡锛欰NY/ALL/SEQUENCE',
  step_status       VARCHAR(20)     DEFAULT 'PENDING' COMMENT '姝ラ鐘舵€侊細PENDING/APPROVED/REJECTED',
  approver_id       BIGINT(20)      DEFAULT NULL COMMENT '瀹為檯瀹℃壒浜篒D',
  approver_name     VARCHAR(64)     DEFAULT NULL COMMENT '瀹為檯瀹℃壒浜哄鍚?,
  approval_time     DATETIME        DEFAULT NULL COMMENT '瀹℃壒鏃堕棿',
  approval_comment  VARCHAR(500)    DEFAULT NULL COMMENT '瀹℃壒鎰忚',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (id),
  KEY idx_approval_id (approval_id),
  KEY idx_step_status (step_status),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='瀹℃壒姝ラ琛?;

-- 32. 娴佺▼鐗堟湰蹇収琛?
DROP TABLE IF EXISTS wf_process_version_snapshot;
CREATE TABLE wf_process_version_snapshot (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹氫箟ID',
  process_key       VARCHAR(64)     NOT NULL COMMENT '娴佺▼Key',
  version           INT             NOT NULL COMMENT '鐗堟湰鍙?,
  snapshot_data     LONGTEXT        NOT NULL COMMENT '蹇収鏁版嵁锛堝畬鏁寸殑娴佺▼瀹氫箟JSON锛?,
  bpmn_xml          LONGTEXT        DEFAULT NULL COMMENT 'BPMN XML锛堝鏋滄湁锛?,
  form_config       TEXT            DEFAULT NULL COMMENT '琛ㄥ崟閰嶇疆蹇収',
  node_config       TEXT            DEFAULT NULL COMMENT '鑺傜偣閰嶇疆蹇収',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (id),
  UNIQUE KEY uk_process_version (process_def_id, version),
  KEY idx_process_key (process_key),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='娴佺▼鐗堟湰蹇収琛?;

-- 33. 鍥炴粴鍘嗗彶琛?
DROP TABLE IF EXISTS wf_deploy_rollback_history;
CREATE TABLE wf_deploy_rollback_history (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  original_deploy_id BIGINT(20)     NOT NULL COMMENT '鍘熷彂甯冭褰旾D',
  rollback_deploy_id BIGINT(20)     NOT NULL COMMENT '鍥炴粴鍚庣殑鍙戝竷璁板綍ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '娴佺▼瀹氫箟ID',
  from_version      INT             NOT NULL COMMENT '鍥炴粴鍓嶇増鏈?,
  to_version        INT             NOT NULL COMMENT '鍥炴粴鍒扮増鏈?,
  rollback_type     VARCHAR(20)     DEFAULT 'MANUAL' COMMENT '鍥炴粴绫诲瀷锛歁ANUAL/AUTO',
  rollback_reason   VARCHAR(500)    DEFAULT NULL COMMENT '鍥炴粴鍘熷洜',
  rollback_by       BIGINT(20)      NOT NULL COMMENT '鍥炴粴鎿嶄綔浜篒D',
  rollback_by_name  VARCHAR(64)     DEFAULT NULL COMMENT '鍥炴粴鎿嶄綔浜哄鍚?,
  rollback_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍥炴粴鏃堕棿',
  success           TINYINT(1)      DEFAULT 1 COMMENT '鏄惁鎴愬姛',
  error_message     TEXT            DEFAULT NULL COMMENT '閿欒淇℃伅',
  PRIMARY KEY (id),
  KEY idx_original_deploy (original_deploy_id),
  KEY idx_rollback_deploy (rollback_deploy_id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鍥炴粴鍘嗗彶琛?;

-- 34. 鍙戝竷褰卞搷鍒嗘瀽琛?
DROP TABLE IF EXISTS wf_deploy_impact;
CREATE TABLE wf_deploy_impact (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '绉熸埛ID',
  deploy_id         BIGINT(20)      NOT NULL COMMENT '鍙戝竷璁板綍ID',
  impact_type       VARCHAR(30)     NOT NULL COMMENT '褰卞搷绫诲瀷锛歊UNNING_INSTANCE/PENDING_TASK/FORM_CHANGE/NODE_CHANGE/PERMISSION_CHANGE',
  impact_level      VARCHAR(20)     NOT NULL COMMENT '褰卞搷绾у埆锛歀OW/MEDIUM/HIGH/CRITICAL',
  impact_count      INT             DEFAULT 0 COMMENT '褰卞搷鏁伴噺',
  impact_detail     TEXT            DEFAULT NULL COMMENT '褰卞搷璇︽儏锛圝SON鏍煎紡锛?,
  mitigation_plan   TEXT            DEFAULT NULL COMMENT '缂撹В鏂规',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_impact_type (impact_type),
  KEY idx_impact_level (impact_level),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='鍙戝竷褰卞搷鍒嗘瀽琛?;

-- =========================================================
-- 鍗佷簩銆侀珮绾у姛鑳芥ā鍧楋紙妯℃澘搴撱€佺増鏈帶鍒躲€佸綊妗ｃ€佸璁★級
-- =========================================================

-- 35. 宸ヤ綔娴佹ā鏉胯〃
DROP TABLE IF EXISTS workflow_template;
CREATE TABLE workflow_template (
    id VARCHAR(64) PRIMARY KEY COMMENT '妯℃澘ID',
    name VARCHAR(200) NOT NULL COMMENT '妯℃澘鍚嶇О',
    description TEXT COMMENT '妯℃澘鎻忚堪',
    category_id VARCHAR(64) COMMENT '鍒嗙被ID',
    tags JSON COMMENT '鏍囩锛圝SON鏁扮粍锛?,
    definition JSON NOT NULL COMMENT '娴佺▼瀹氫箟锛圝SON鏍煎紡锛?,
    preview_image VARCHAR(500) COMMENT '棰勮鍥剧墖URL',
    created_by VARCHAR(64) NOT NULL COMMENT '鍒涘缓浜篒D',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    usage_count INT DEFAULT 0 COMMENT '浣跨敤娆℃暟',
    is_system TINYINT(1) DEFAULT 0 COMMENT '鏄惁绯荤粺妯℃澘',
    status VARCHAR(20) DEFAULT 'active' COMMENT '鐘舵€侊細active/inactive',
    tenant_id BIGINT(20) DEFAULT 100000 COMMENT '绉熸埛ID',
    INDEX idx_category (category_id),
    INDEX idx_created_by (created_by),
    INDEX idx_status (status),
    INDEX idx_tenant (tenant_id),
    INDEX idx_category_status (category_id, status) COMMENT '浼樺寲鍒嗙被绛涢€夋煡璇?,
    INDEX idx_usage_count (usage_count DESC) COMMENT '浼樺寲鐑棬妯℃澘鏌ヨ',
    INDEX idx_created_at (created_at DESC) COMMENT '浼樺寲鏈€鏂版ā鏉挎煡璇?
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宸ヤ綔娴佹ā鏉胯〃';

-- 36. 妯℃澘鍒嗙被琛?
DROP TABLE IF EXISTS template_category;
CREATE TABLE template_category (
    id VARCHAR(64) PRIMARY KEY COMMENT '鍒嗙被ID',
    name VARCHAR(100) NOT NULL COMMENT '鍒嗙被鍚嶇О',
    description VARCHAR(500) COMMENT '鍒嗙被鎻忚堪',
    parent_id VARCHAR(64) COMMENT '鐖跺垎绫籌D',
    order_num INT DEFAULT 0 COMMENT '鎺掑簭鍙?,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
    tenant_id BIGINT(20) DEFAULT 100000 COMMENT '绉熸埛ID',
    INDEX idx_parent (parent_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_parent_order (parent_id, order_num) COMMENT '浼樺寲鍒嗙被鏍戞煡璇?
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='妯℃澘鍒嗙被琛?;

-- 37. 宸ヤ綔娴佺増鏈〃
DROP TABLE IF EXISTS workflow_version;
CREATE TABLE workflow_version (
    id VARCHAR(64) PRIMARY KEY COMMENT '鐗堟湰ID',
    workflow_id VARCHAR(64) NOT NULL COMMENT '宸ヤ綔娴両D锛堝搴?wf_process_definition.definition_id锛?,
    version_number VARCHAR(20) NOT NULL COMMENT '鐗堟湰鍙凤紙濡傦細1.0.0锛?,
    definition JSON NOT NULL COMMENT '娴佺▼瀹氫箟蹇収锛圝SON鏍煎紡锛?,
    change_log TEXT COMMENT '鍙樻洿鏃ュ織',
    change_type VARCHAR(20) NOT NULL COMMENT '鍙樻洿绫诲瀷锛歁AJOR/MINOR/PATCH/ROLLBACK',
    created_by VARCHAR(64) NOT NULL COMMENT '鍒涘缓浜篒D',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
    is_rollback TINYINT(1) DEFAULT 0 COMMENT '鏄惁鍥炴粴鐗堟湰',
    rollback_from_version VARCHAR(20) COMMENT '鍥炴粴鑷摢涓増鏈?,
    checksum VARCHAR(64) NOT NULL COMMENT '瀹氫箟鏍￠獙鍜岋紙MD5锛?,
    tenant_id BIGINT(20) DEFAULT 100000 COMMENT '绉熸埛ID',
    INDEX idx_workflow (workflow_id),
    INDEX idx_version (workflow_id, version_number),
    INDEX idx_created_at (created_at),
    INDEX idx_tenant (tenant_id),
    INDEX idx_workflow_created (workflow_id, created_at DESC) COMMENT '浼樺寲鐗堟湰鍘嗗彶鏌ヨ',
    INDEX idx_workflow_version_number (workflow_id, version_number) COMMENT '浼樺寲鐗堟湰鍙锋煡璇?,
    UNIQUE KEY uk_workflow_version (workflow_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宸ヤ綔娴佺増鏈〃';

-- 38. 宸ヤ綔娴佸綊妗ｈ〃
DROP TABLE IF EXISTS workflow_archive;
CREATE TABLE workflow_archive (
    id VARCHAR(64) PRIMARY KEY COMMENT '褰掓。ID',
    workflow_id VARCHAR(64) NOT NULL COMMENT '宸ヤ綔娴両D',
    workflow_name VARCHAR(200) NOT NULL COMMENT '宸ヤ綔娴佸悕绉?,
    archived_by VARCHAR(64) NOT NULL COMMENT '褰掓。浜篒D',
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '褰掓。鏃堕棿',
    archive_reason TEXT COMMENT '褰掓。鍘熷洜',
    can_restore TINYINT(1) DEFAULT 1 COMMENT '鏄惁鍙仮澶?,
    original_data JSON NOT NULL COMMENT '鍘熷鏁版嵁锛圝SON鏍煎紡锛?,
    tenant_id BIGINT(20) DEFAULT 100000 COMMENT '绉熸埛ID',
    INDEX idx_workflow (workflow_id),
    INDEX idx_archived_by (archived_by),
    INDEX idx_archived_at (archived_at),
    INDEX idx_tenant (tenant_id),
    INDEX idx_archived_at_desc (archived_at DESC) COMMENT '浼樺寲褰掓。鏃堕棿鏌ヨ',
    INDEX idx_archived_by_time (archived_by, archived_at DESC) COMMENT '浼樺寲鎸夊綊妗ｄ汉鏌ヨ',
    INDEX idx_workflow_restore (workflow_id, can_restore) COMMENT '浼樺寲褰掓。鎭㈠鏌ヨ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宸ヤ綔娴佸綊妗ｈ〃';

-- 39. 宸ヤ綔娴佸璁℃棩蹇楄〃
-- 娉ㄦ剰锛氳繖涓?sys_audit_log 琛ㄤ笉鍚?
-- sys_audit_log锛氳褰曟暟鎹彉鏇寸殑瀛楁绾у樊寮傦紙浣跨敤 Javers 杩涜瀵硅薄宸紓姣旇緝锛?
-- wf_audit_log锛氳褰曞伐浣滄祦楂樼骇鍔熻兘鐨勫叧閿搷浣滐紙妯℃澘绠＄悊銆佺増鏈洖婊氥€佸綊妗ｃ€佸垹闄ょ瓑锛?
DROP TABLE IF EXISTS wf_audit_log;
CREATE TABLE wf_audit_log (
    id VARCHAR(64) PRIMARY KEY COMMENT '瀹¤鏃ュ織ID',
    operation_type VARCHAR(50) NOT NULL COMMENT '鎿嶄綔绫诲瀷锛歍EMPLATE_CREATE/TEMPLATE_UPDATE/TEMPLATE_DELETE/VERSION_CREATE/VERSION_ROLLBACK/ARCHIVE_CREATE/ARCHIVE_RESTORE/BATCH_ARCHIVE/BATCH_DELETE',
    target_type VARCHAR(50) NOT NULL COMMENT '鎿嶄綔瀵硅薄绫诲瀷锛歍EMPLATE/WORKFLOW/VERSION/ARCHIVE',
    target_id VARCHAR(64) NOT NULL COMMENT '鎿嶄綔瀵硅薄ID',
    target_name VARCHAR(200) COMMENT '鎿嶄綔瀵硅薄鍚嶇О',
    operator_id VARCHAR(64) NOT NULL COMMENT '鎿嶄綔浜篒D',
    operator_name VARCHAR(100) COMMENT '鎿嶄綔浜哄悕绉?,
    operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鎿嶄綔鏃堕棿',
    operation_reason TEXT COMMENT '鎿嶄綔鍘熷洜',
    operation_details TEXT COMMENT '鎿嶄綔璇︽儏锛圝SON鏍煎紡锛?,
    operation_result VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' COMMENT '鎿嶄綔缁撴灉锛歋UCCESS/FAILED',
    error_message TEXT COMMENT '閿欒淇℃伅',
    ip_address VARCHAR(50) COMMENT 'IP鍦板潃',
    user_agent VARCHAR(500) COMMENT '鐢ㄦ埛浠ｇ悊',
    tenant_id BIGINT COMMENT '绉熸埛ID',
    INDEX idx_operation_type (operation_type),
    INDEX idx_target_type (target_type),
    INDEX idx_target_id (target_id),
    INDEX idx_operator_id (operator_id),
    INDEX idx_operation_time (operation_time),
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_target_operation (target_type, target_id, operation_type) COMMENT '浼樺寲瀹¤鏃ュ織鏌ヨ',
    INDEX idx_operator_time (operator_id, operation_time DESC) COMMENT '浼樺寲鎿嶄綔浜烘棩蹇楁煡璇?
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宸ヤ綔娴佸璁℃棩蹇楄〃';

-- =========================================================
-- 鍒濆鍖栨暟鎹?- 妯℃澘鍒嗙被
-- =========================================================
INSERT INTO template_category (id, name, description, order_num, tenant_id) VALUES
('cat-hr', '浜轰簨绠＄悊', '浜哄姏璧勬簮鐩稿叧娴佺▼妯℃澘', 1, 100000),
('cat-finance', '璐㈠姟绠＄悊', '璐㈠姟鐩稿叧娴佺▼妯℃澘', 2, 100000),
('cat-procurement', '閲囪喘绠＄悊', '閲囪喘鐩稿叧娴佺▼妯℃澘', 3, 100000),
('cat-contract', '鍚堝悓绠＄悊', '鍚堝悓瀹℃壒鐩稿叧娴佺▼妯℃澘', 4, 100000),
('cat-admin', '琛屾斂绠＄悊', '琛屾斂绠＄悊娴佺▼妯℃澘', 5, 100000);

-- =========================================================
-- 鍒濆鍖栨暟鎹?- 棰勭疆娴佺▼妯℃澘
-- =========================================================

-- 1. 璇峰亣鐢宠妯℃澘
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-leave-001', '请假申请', '员工请假审批流程模板', 'cat-hr',
'["请假", "审批", "人事"]',
'{
  "nodes": [
    {"id": "start_leave", "type": "START", "title": "提交请假申请"},
    {"id": "approval_leave_manager", "type": "APPROVAL", "title": "部门经理审批", "approverType": "ROLE", "approverValue": "ADMIN"},
    {"id": "end_leave", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_leave->approval_leave_manager", "source": "start_leave", "target": "approval_leave_manager"},
    {"id": "approval_leave_manager->end_leave", "source": "approval_leave_manager", "target": "end_leave"}
  ]
}',
1, 'active', 'system', 100000);

-- 2. 费用报销模板
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-expense-001', '费用报销', '员工费用报销审批流程模板', 'cat-finance',
'["报销", "财务", "审批"]',
'{
  "nodes": [
    {"id": "start_expense", "type": "START", "title": "提交报销申请"},
    {"id": "approval_expense_manager", "type": "APPROVAL", "title": "部门经理审批", "approverType": "ROLE", "approverValue": "ADMIN"},
    {"id": "approval_expense_finance", "type": "APPROVAL", "title": "财务审核", "approverType": "ROLE", "approverValue": "ADMIN"},
    {"id": "end_expense", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_expense->approval_expense_manager", "source": "start_expense", "target": "approval_expense_manager"},
    {"id": "approval_expense_manager->approval_expense_finance", "source": "approval_expense_manager", "target": "approval_expense_finance"},
    {"id": "approval_expense_finance->end_expense", "source": "approval_expense_finance", "target": "end_expense"}
  ]
}',
1, 'active', 'system', 100000);

-- 3. 采购申请模板
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-purchase-001', '采购申请', '物资采购审批流程模板', 'cat-procurement',
'["采购", "审批", "物资"]',
'{
  "nodes": [
    {"id": "start_purchase", "type": "START", "title": "提交采购申请"},
    {"id": "approval_purchase_manager", "type": "APPROVAL", "title": "部门审批", "approverType": "ROLE", "approverValue": "ADMIN"},
    {"id": "end_purchase", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_purchase->approval_purchase_manager", "source": "start_purchase", "target": "approval_purchase_manager"},
    {"id": "approval_purchase_manager->end_purchase", "source": "approval_purchase_manager", "target": "end_purchase"}
  ]
}',
1, 'active', 'system', 100000);

-- 4. 合同审批模板
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-contract-001', '合同审批', '合同审批流程（含法务审核）', 'cat-contract',
'["合同", "审批", "法务"]',
'{
  "nodes": [
    {"id": "start_contract", "type": "START", "title": "提交合同"},
    {"id": "approval_contract_legal", "type": "APPROVAL", "title": "法务审核", "approverType": "ROLE", "approverValue": "ADMIN"},
    {"id": "approval_contract_leader", "type": "APPROVAL", "title": "领导审批", "approverType": "ROLE", "approverValue": "ADMIN"},
    {"id": "end_contract", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_contract->approval_contract_legal", "source": "start_contract", "target": "approval_contract_legal"},
    {"id": "approval_contract_legal->approval_contract_leader", "source": "approval_contract_legal", "target": "approval_contract_leader"},
    {"id": "approval_contract_leader->end_contract", "source": "approval_contract_leader", "target": "end_contract"}
  ]
}',
1, 'active', 'system', 100000);

-- 5. 出差申请模板
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-trip-001', '出差申请', '员工出差审批流程模板', 'cat-admin',
'["出差", "审批", "行政"]',
'{
  "nodes": [
    {"id": "start_trip", "type": "START", "title": "提交出差申请"},
    {"id": "approval_trip_manager", "type": "APPROVAL", "title": "部门经理审批", "approverType": "ROLE", "approverValue": "ADMIN"},
    {"id": "end_trip", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_trip->approval_trip_manager", "source": "start_trip", "target": "approval_trip_manager"},
    {"id": "approval_trip_manager->end_trip", "source": "approval_trip_manager", "target": "end_trip"}
  ]
}',
1, 'active', 'system', 100000);

SET FOREIGN_KEY_CHECKS = 1;

