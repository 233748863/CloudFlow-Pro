# 批次 G：基础能力与体验建表确认草案

草案日期：2026-09-11。审定状态：用户已回复“确认”，本稿的推荐口径及显式补充字段获准实施；六张新表和三张改表已合入正式初始化脚本。运行库保持不动，代码实施与验收进度见 `G-批次G实施核对.md`；下文保留审定前的核验基线和设计依据。

DDL = 定义数据库表、字段和索引的语句。本稿包含六张新表的完整定义及三张既有表的结构增量，供审阅使用。文中的 `ALTER TABLE` 表达结构差异，不作为运行库升级脚本执行；本稿不包含删表语句。正式实施按通用约束直接维护 `01–07` 初始化脚本，`07` 由生成器产生，不手改；现有运行库的历史数据不通过重跑初始化脚本覆盖。

## 1. 已审定口径

### 1.1 提示词第七节的三项必问事项

| 对象 | 本稿推荐定义 | 业务含义 |
| --- | --- | --- |
| `sys_import_error.cell_value` | `MEDIUMTEXT DEFAULT NULL` | 保留长单元格原值，避免限定为 500 字符后截断；错误明细存表，同时生成错误标注文件。 |
| `sys_print_template` 模板内容 | HTML 使用 `template_content LONGTEXT`；Excel 使用 `template_file_url VARCHAR(500)` 引用 `sys_file` | HTML 渲染从表中取文本；Excel 填充先经文件权限校验再读取模板文件。模板修改递增 `version`，不增加版本历史表。 |
| `sys_print_record.ip_address` | `VARCHAR(45) DEFAULT NULL` | 支持 IPv4、IPv6，与 F4 的 `oa_contract.our_sign_ip VARCHAR(45)` 一致；服务端采集，无法取得时留空，不让前端指定审计地址。 |

模板存储约束：`template_format='HTML'` 时内容必填、文件引用为空；`template_format='EXCEL'` 时文件引用必填、HTML 内容为空。HTML 模板允许输出 HTML/PDF，Excel 模板输出 EXCEL；服务端校验组合，禁止靠有值的任意一列猜测模板格式。可信代理配置尚未完成验证，届时只能如实记录已验证的来源地址，不能把未经验证的转发头宣称为真实终端 IP。

### 1.2 为闭合字段定义而提出的补充建议

| 项目 | 本稿拟定内容 | 原因及审定边界 |
| --- | --- | --- |
| 导入错误的租户字段 | 补 `sys_import_error.tenant_id BIGINT(20) NOT NULL DEFAULT 100000` | PRD 的简写清单未列该字段；错误分页、统计、清理必须与所属导入任务同租户。由服务端从任务复制，禁止客户端指定。 |
| 自定义纸张宽高 | 补 `sys_print_template.paper_width_mm`、`paper_height_mm`，均为 `DECIMAL(6,2) DEFAULT NULL` | PRD 明确有 `CUSTOM`，字段清单缺少自定义尺寸；本稿建议显式存宽高，随草案审定，不把未定义字段冒称原设计已有。 |
| 页边距与宽高约束 | 四边距 `DECIMAL(6,2) NOT NULL DEFAULT 10.00`，单位 mm | 默认 10 mm 是本稿建议值。`CUSTOM` 要求宽高在 0.01–9999.99 mm；标准纸型宽高列为空，按纸型取尺寸。方向转换后，左右边距之和必须小于纸宽，上下边距之和必须小于纸高，边距不可为负。 |

除上述一列租户字段、两列纸张尺寸外，四张待补表的业务字段来自相应 PRD；审计列、逻辑删除列、版本列按本稿第二节说明补齐。两张已有完整 DDL 的 G3 表不增加业务字段，本稿把其 `tenant_id` 收紧为 `NOT NULL`，并将涉及租户查询的索引前置 `tenant_id`；发生时间清理索引保持独立。这些差异同样随本稿审定。

## 2. 共同建表与数据约束

- 六张新表均放入 `01.cloudflow-common.sql`：`BIGINT(20)` 自增主键，`AUTO_INCREMENT=100`，InnoDB，utf8mb4；每列及每张表均有 `COMMENT`。列名按 17 字符字段宽度排版，超长列名后至少留一空格；不建立物理外键。
- 六张新表的租户列均为 `BIGINT(20) NOT NULL DEFAULT 100000`，实际写入值来自服务端租户上下文；关联任务、模板、业务记录、文件时必须校验同租户。文件配置仍按原设计允许租户 `0` 表示平台配置，该值不授予跨租户文件访问权限。
- 文件配置和打印模板为配置表，含 `deleted`、`version` 及四个审计列。导入任务为可更新状态的任务流水，含四个审计列、不加 `deleted`；状态推进采用带前置状态条件的更新防重复导入。导入错误只记创建时间；打印流水保留创建人、创建时间；API 错误保留原设计的创建时间及处理人、处理时间字段，三类日志/流水均不加 `deleted`。
- 模板编码、存储配置编码的唯一键不含 `deleted`：逻辑删除后重用同编码应恢复原记录，避免历史引用歧义。任务编号按租户唯一；同一单元格允许多类错误，不设错误明细的行列唯一键。
- `master_flag`、`default_flag` 使用普通索引，不能以唯一的“租户＋布尔标记”限制默认项，否则会连带限制非默认记录数量。实现时须对同租户的默认配置切换串行化；打印模板还须限定 `biz_type`，在同一事务内取消旧默认、设置新默认。无现存默认记录的首次创建也必须受相同并发控制；只有启用且未删除的记录可以成为默认项。
- 各表 `file_url`、`error_file_url`、`template_file_url` 保存可长期解析的 `sys_file` 受控文件引用，列名保留 PRD 命名；不保存短期签名 URL，也不保存可绕过业务权限的公网直链。文件服务统一生成和解析引用，下载时重新鉴权并签发地址。
- 文件字节数、行数及耗时不得为负；未开始任务的起止时间和耗时为空。行数统计排除表头；错误行号使用 Excel 原始行号，从 1 开始并包含表头的位置。导入默认最多 10000 行，100000 行仅属于流式读取的压力验证，不据此放开业务默认限额。
- 导入错误随任务保留期清理，默认 30 天；打印临时输出默认 7 天到期清理，清理输出文件不连带删除打印审计记录。API 错误默认保留 180 天，操作日志默认保留 30 天。清理仍须遵守不可变审计表约束，不能套用通用业务删除接口。

## 3. G3：两张已有定义的新表

### 3.1 文件存储配置 `sys_file_config`

```sql
CREATE TABLE sys_file_config (
  config_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID（0为平台级）',
  config_code       VARCHAR(50)     NOT NULL COMMENT '配置编码',
  config_name       VARCHAR(100)    NOT NULL COMMENT '配置名称',
  storage_type      VARCHAR(20)     NOT NULL COMMENT '存储类型（LOCAL/MINIO/S3/OSS/COS）',
  master_flag       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否主用（0否1是）',
  endpoint          VARCHAR(300)    DEFAULT NULL COMMENT '端点',
  region            VARCHAR(50)     DEFAULT NULL COMMENT '区域',
  bucket            VARCHAR(100)    DEFAULT NULL COMMENT '桶名',
  access_key        VARCHAR(200)    DEFAULT NULL COMMENT 'AccessKey',
  secret_key_cipher VARCHAR(500)    DEFAULT NULL COMMENT 'SecretKey（加密存储）',
  base_path         VARCHAR(300)    DEFAULT NULL COMMENT '基础路径',
  domain            VARCHAR(300)    DEFAULT NULL COMMENT '访问域名',
  max_file_size     BIGINT(20)      DEFAULT 52428800 COMMENT '单文件上限（字节，默认50MiB）',
  allowed_extensions VARCHAR(1000)  DEFAULT NULL COMMENT '允许扩展名（逗号分隔，空为系统默认白名单）',
  signed_url_expire_seconds INT     NOT NULL DEFAULT 300 COMMENT '签名URL有效期（秒）',
  access_policy     VARCHAR(10)     NOT NULL DEFAULT '0' COMMENT '访问策略（0私有1公共读2自定义，非LOCAL强制为0）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态（ENABLED/DISABLED）',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除（0未删除1已删除）',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (config_id),
  UNIQUE KEY uk_sfc_code (tenant_id, config_code),
  KEY idx_sfc_master (tenant_id, master_flag, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='文件存储配置表';
```

`access_policy` 默认值只负责新记录的初始值，不能代替代码强制校验。非 LOCAL 配置若非私有，保存必须失败；启用的对象存储配置不符合私有策略时，启动必须失败。`OssProperties.accessPolicy` 默认值另须从 `"1"` 改成 `"0"`，禁止降级为 WARN 后继续服务。签名有效期默认 300 秒、最大 3600 秒；密钥沿用已有加密组件，接口回显脱敏。

### 3.2 API 错误日志 `sys_api_error_log`

```sql
CREATE TABLE sys_api_error_log (
  error_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  trace_id          VARCHAR(64)     DEFAULT NULL COMMENT '链路追踪ID',
  service_name      VARCHAR(50)     DEFAULT NULL COMMENT '服务名',
  user_id           BIGINT(20)      DEFAULT NULL COMMENT '用户ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '用户名',
  request_method    VARCHAR(10)     DEFAULT NULL COMMENT '请求方法',
  request_url       VARCHAR(500)    DEFAULT NULL COMMENT '请求URL（敏感参数已脱敏）',
  request_params    TEXT            DEFAULT NULL COMMENT '请求参数（已脱敏）',
  exception_class   VARCHAR(200)    DEFAULT NULL COMMENT '异常类',
  exception_message VARCHAR(2000)   DEFAULT NULL COMMENT '异常消息（已脱敏）',
  exception_stack   TEXT            DEFAULT NULL COMMENT '异常栈（已脱敏）',
  client_ip         VARCHAR(64)     DEFAULT NULL COMMENT '客户端IP',
  user_agent        VARCHAR(500)    DEFAULT NULL COMMENT 'UserAgent',
  occur_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
  process_status    VARCHAR(20)     NOT NULL DEFAULT 'TODO' COMMENT '处理状态（TODO/PROCESSING/DONE/IGNORED）',
  process_by        VARCHAR(64)     DEFAULT NULL COMMENT '处理人',
  process_time      DATETIME        DEFAULT NULL COMMENT '处理时间',
  process_remark    VARCHAR(500)    DEFAULT NULL COMMENT '处理说明',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (error_id),
  KEY idx_sael_trace (tenant_id, trace_id),
  KEY idx_sael_time (occur_time),
  KEY idx_sael_status (tenant_id, process_status, occur_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='API错误日志表';
```

## 4. G2：补齐两张导入表

### 4.1 导入任务 `sys_import_task`

```sql
CREATE TABLE sys_import_task (
  task_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  task_no           VARCHAR(64)     NOT NULL COMMENT '任务编号（租户内唯一）',
  biz_type          VARCHAR(50)     NOT NULL COMMENT '导入业务类型',
  biz_name          VARCHAR(100)    NOT NULL COMMENT '导入业务名称快照',
  file_name         VARCHAR(255)    NOT NULL COMMENT '原始文件名',
  file_url          VARCHAR(500)    NOT NULL COMMENT '原文件持久引用（sys_file，非签名URL）',
  file_size         BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '原文件大小（字节）',
  total_rows        INT             NOT NULL DEFAULT 0 COMMENT '总数据行数（不含表头）',
  valid_rows        INT             NOT NULL DEFAULT 0 COMMENT '校验通过行数',
  invalid_rows      INT             NOT NULL DEFAULT 0 COMMENT '校验失败行数',
  success_rows      INT             NOT NULL DEFAULT 0 COMMENT '导入成功行数',
  fail_rows         INT             NOT NULL DEFAULT 0 COMMENT '导入失败行数',
  status            VARCHAR(20)     NOT NULL DEFAULT 'UPLOADED' COMMENT '任务状态（UPLOADED/VALIDATING/VALIDATED/IMPORTING/SUCCESS/PARTIAL/FAILED/CANCELLED）',
  error_file_url    VARCHAR(500)    DEFAULT NULL COMMENT '错误标注文件持久引用（sys_file，非签名URL）',
  operator_id       BIGINT(20)      NOT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     NOT NULL COMMENT '操作人姓名快照',
  start_time        DATETIME        DEFAULT NULL COMMENT '任务开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '任务结束时间',
  duration_ms       BIGINT(20)      DEFAULT NULL COMMENT '任务耗时（毫秒，未开始时为空）',
  error_message     VARCHAR(2000)   DEFAULT NULL COMMENT '整体错误信息（已脱敏）',
  job_log_id        BIGINT(20)      DEFAULT NULL COMMENT '异步执行关联的sys_job_log主键',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (task_id),
  UNIQUE KEY uk_sit_no (tenant_id, task_no),
  KEY idx_sit_biz (tenant_id, biz_type, status, create_time),
  KEY idx_sit_operator (tenant_id, operator_id, create_time),
  KEY idx_sit_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='Excel导入任务表';
```

`job_log_id` 只引用真实调度执行日志；同步任务为空，不伪造调度记录。校验失败行与实际导入失败行分别统计；取消和失败保留任务记录，通过 `status` 表达，不以删除代替状态变化。

### 4.2 导入错误 `sys_import_error`

```sql
CREATE TABLE sys_import_error (
  error_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID（与所属导入任务一致）',
  task_id           BIGINT(20)      NOT NULL COMMENT '所属导入任务ID',
  row_no            INT             NOT NULL COMMENT 'Excel原始行号（从1开始，包含表头位置）',
  column_name       VARCHAR(100)    DEFAULT NULL COMMENT '错误列名（整行错误时为空）',
  cell_value        MEDIUMTEXT      DEFAULT NULL COMMENT '单元格原始值',
  error_type        VARCHAR(20)     NOT NULL COMMENT '错误类型（REQUIRED/FORMAT/RANGE/DUPLICATE/REFERENCE/BUSINESS）',
  error_message     VARCHAR(2000)   NOT NULL COMMENT '错误说明',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (error_id),
  KEY idx_sie_task (tenant_id, task_id, row_no, error_id),
  KEY idx_sie_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='Excel导入错误明细表';
```

查询和清理均先验证任务所属租户及操作者权限；`cell_value` 可以包含业务敏感值，分页接口和错误标注文件必须沿用原任务权限，禁止写入通用请求日志。错误明细不设置 `deleted`、`version` 或物理外键。

## 5. G5：补齐两张打印表

### 5.1 打印模板 `sys_print_template`

```sql
CREATE TABLE sys_print_template (
  template_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  template_code     VARCHAR(50)     NOT NULL COMMENT '模板编码（租户内唯一）',
  template_name     VARCHAR(100)    NOT NULL COMMENT '模板名称',
  biz_type          VARCHAR(50)     NOT NULL COMMENT '打印业务类型',
  template_format   VARCHAR(20)     NOT NULL DEFAULT 'HTML' COMMENT '模板格式（HTML/EXCEL）',
  output_format     VARCHAR(20)     NOT NULL DEFAULT 'PDF' COMMENT '输出格式（PDF/EXCEL/HTML）',
  template_content  LONGTEXT        DEFAULT NULL COMMENT 'HTML模板内容（EXCEL时为空）',
  template_file_url VARCHAR(500)    DEFAULT NULL COMMENT 'EXCEL模板持久引用（sys_file，HTML时为空）',
  paper_size        VARCHAR(20)     NOT NULL DEFAULT 'A4' COMMENT '纸张规格（A4/A5/LETTER/CUSTOM）',
  orientation       VARCHAR(20)     NOT NULL DEFAULT 'PORTRAIT' COMMENT '方向（PORTRAIT纵向/LANDSCAPE横向）',
  paper_width_mm    DECIMAL(6,2)    DEFAULT NULL COMMENT '自定义纸张基础宽度（mm，仅CUSTOM必填）',
  paper_height_mm   DECIMAL(6,2)    DEFAULT NULL COMMENT '自定义纸张基础高度（mm，仅CUSTOM必填）',
  margin_top        DECIMAL(6,2)    NOT NULL DEFAULT 10.00 COMMENT '上边距（mm）',
  margin_bottom     DECIMAL(6,2)    NOT NULL DEFAULT 10.00 COMMENT '下边距（mm）',
  margin_left       DECIMAL(6,2)    NOT NULL DEFAULT 10.00 COMMENT '左边距（mm）',
  margin_right      DECIMAL(6,2)    NOT NULL DEFAULT 10.00 COMMENT '右边距（mm）',
  variables_declare JSON            DEFAULT NULL COMMENT '可用变量声明（JSON，仅作配置参考）',
  default_flag      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否该业务类型默认模板（0否1是）',
  version           INT             NOT NULL DEFAULT 0 COMMENT '模板修订及乐观锁版本号（修改递增）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态（ENABLED/DISABLED）',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除（0未删除1已删除）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (template_id),
  UNIQUE KEY uk_spt_code (tenant_id, template_code),
  KEY idx_spt_biz (tenant_id, biz_type, status, default_flag)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='打印模板配置表';
```

`variables_declare` 仅向管理员说明可用字段，不能扩大当前打印人的数据权限。自定义尺寸按基础方向保存，横向时宽高只交换一次；已有纸型的尺寸由渲染器按规格取值。模板修订只更新同一条模板及其版本号，本稿不新增版本表或关联表。

### 5.2 打印记录 `sys_print_record`

```sql
CREATE TABLE sys_print_record (
  record_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  template_id       BIGINT(20)      NOT NULL COMMENT '打印模板ID',
  template_code     VARCHAR(50)     NOT NULL COMMENT '打印时模板编码快照',
  biz_type          VARCHAR(50)     NOT NULL COMMENT '打印业务类型',
  biz_id            VARCHAR(64)     NOT NULL COMMENT '被打印业务记录ID',
  output_format     VARCHAR(20)     NOT NULL COMMENT '实际输出格式（PDF/EXCEL/HTML）',
  file_url          VARCHAR(500)    DEFAULT NULL COMMENT '输出文件持久引用（sys_file，直接流式返回时可为空）',
  operator_id       BIGINT(20)      NOT NULL COMMENT '打印操作人ID',
  operator_name     VARCHAR(64)     NOT NULL COMMENT '打印操作人姓名快照',
  print_time        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '打印时间',
  ip_address        VARCHAR(45)     DEFAULT NULL COMMENT '服务端采集的来源IP（支持IPv4和IPv6）',
  file_size         BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '生成文件大小（字节）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (record_id),
  KEY idx_spr_biz (tenant_id, biz_type, biz_id, print_time),
  KEY idx_spr_template (tenant_id, template_id, print_time),
  KEY idx_spr_operator (tenant_id, operator_id, print_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='打印记录表';
```

打印记录只追加，保留操作人与模板编码快照，不加 `deleted`、`version` 或修改接口。普通打印人的记录查询只能查看其有权访问的业务记录；文件到期后不得绕过重新鉴权从旧记录恢复下载能力。

## 6. 三张既有表的结构差异

### 6.1 `sys_file`：实际新增八列

```sql
ALTER TABLE sys_file
  ADD COLUMN config_id BIGINT(20) DEFAULT NULL COMMENT '所用存储配置ID',
  ADD COLUMN file_hash VARCHAR(64) DEFAULT NULL COMMENT 'SHA256（去重用）',
  ADD COLUMN bucket VARCHAR(100) DEFAULT NULL COMMENT '桶名',
  ADD COLUMN object_key VARCHAR(500) DEFAULT NULL COMMENT '对象键',
  ADD COLUMN access_type VARCHAR(20) NOT NULL DEFAULT 'PRIVATE' COMMENT '访问类型（PRIVATE/PUBLIC）',
  ADD COLUMN biz_type VARCHAR(50) DEFAULT NULL COMMENT '业务类型（权限校验分派用）',
  ADD COLUMN biz_id VARCHAR(64) DEFAULT NULL COMMENT '业务ID',
  ADD COLUMN ref_count INT NOT NULL DEFAULT 1 COMMENT '引用计数（去重后多处引用）',
  MODIFY COLUMN storage_type VARCHAR(20) DEFAULT 'LOCAL' COMMENT '存储类型（LOCAL/OSS/MINIO/S3/COS）',
  ADD KEY idx_sf_hash (tenant_id, file_hash),
  ADD KEY idx_sf_biz (tenant_id, biz_type, biz_id);
```

原设计标“增 7 列”，实际清单有八列，现有 12 列实施后为 20 列。`storage_type` 只扩充注释和代码枚举，不改列宽、默认值或旧记录。哈希索引不是唯一索引；相同内容不代表相同业务可见范围，不能仅因哈希命中就复用其他业务的访问权限。未知或空 `biz_type` 不因此获得通用私有文件下载许可。

### 6.2 `sys_log`：复用 `user_agent`，新增八列

```sql
ALTER TABLE sys_log
  ADD COLUMN trace_id VARCHAR(64) DEFAULT NULL COMMENT '链路追踪ID',
  ADD COLUMN service_name VARCHAR(64) DEFAULT NULL COMMENT '服务名',
  ADD COLUMN request_method VARCHAR(10) DEFAULT NULL COMMENT '请求方法',
  ADD COLUMN request_url VARCHAR(500) DEFAULT NULL COMMENT '请求URL（敏感参数已脱敏）',
  ADD COLUMN duration_ms BIGINT(20) DEFAULT NULL COMMENT '请求耗时（毫秒）',
  ADD COLUMN result_code INT DEFAULT NULL COMMENT '业务响应码（无业务响应体时为空）',
  ADD COLUMN client_ip VARCHAR(64) DEFAULT NULL COMMENT '客户端IP',
  ADD COLUMN slow_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否慢请求（0否1是）',
  ADD KEY idx_log_trace (tenant_id, trace_id),
  ADD KEY idx_log_slow (tenant_id, slow_flag, create_time),
  ADD KEY idx_log_service (tenant_id, service_name, create_time);
```

`user_agent VARCHAR(500)` 已存在，九项字段清单里只有八项需要新增，现有 14 列实施后为 22 列。`result_code` 采用 `INT`，与当前统一响应对象 `R.code` 的 `int` 对齐，不混写 HTTP 状态码。

| 现存字段 | 本稿新增的对应字段 | 实施口径 |
| --- | --- | --- |
| `service_id VARCHAR(64)` | `service_name VARCHAR(64)` | 保留服务名容量。 |
| `method VARCHAR(10)` | `request_method VARCHAR(10)` | 同一请求方法来源。 |
| `request_uri VARCHAR(255)` | `request_url VARCHAR(500)` | 新字段记录统一脱敏后的 URL，禁止直接复制带凭据的原始请求。 |
| `time BIGINT(20)` | `duration_ms BIGINT(20)` | 单位均为毫秒。 |
| `remote_addr VARCHAR(128)` | `client_ip VARCHAR(64)` | 新字段只记录服务端解析出的单一地址，不能把代理链原串截断塞入。 |

本稿按提示词保留原有列并增列，不暗中删除或重命名既有列。M5 须同步把日志生产者、实体、持久化和查询切换到统一的新字段口径，不增加双写兼容层；运行库旧日志的新列未回填，不能宣称历史记录已具备追踪 ID 或新维度。URL、参数、异常消息和栈均须在写入前脱敏，签名 URL 中的 `token`、`Signature` 等凭据不得进入日志。

### 6.3 `oa_frontend_error_log`：新增一列

```sql
ALTER TABLE oa_frontend_error_log
  ADD COLUMN trace_id VARCHAR(64) DEFAULT NULL COMMENT '关联请求的链路追踪ID',
  ADD KEY idx_fe_error_trace (tenant_id, trace_id);
```

该表位于 `04.cloudflow-oa.sql`，现有 16 列实施后为 17 列；已有 `client_ip VARCHAR(64)`，不重复增加。浏览器错误关联请求的追踪 ID，租户和操作者仍由服务端验证，不能仅凭同一 `trace_id` 开放跨租户日志。

## 7. 已完成的阅读复述与现状核验

### 7.1 安全前提

Hutool 的模板模块提供引擎适配，本身不提供本批要求的受限渲染能力。当前代码生成器已经依赖 Velocity 2.3，“仓库没有任何模板引擎依赖”这一旧前提已经过时；该依赖不改变打印采用 Freemarker 的决定，也不要求替换代码生成器。RCE = 模板内容触发服务器执行系统命令；安全报告 §3 已实测 Freemarker 默认配置的 `?new()` 能触发该行为，所以打印必须显式使用 Freemarker 2.3.32 及以下三项加固，不能以字符串黑名单替代。

```java
configuration.setNewBuiltinClassResolver(TemplateClassResolver.ALLOWS_NOTHING_RESOLVER);
configuration.setAPIBuiltinEnabled(false);
configuration.setObjectWrapper(new SimpleObjectWrapper(Configuration.VERSION_2_3_32));
```

POJO = Java 业务实体对象；`SimpleObjectWrapper` 拒绝包装此类对象。`PrintDataProvider` 必须递归输出 Map、List 和简单值，嵌套明细也不能保留实体；渲染前按调用者权限过滤字段，缺少出站过滤实现时不能用空实现放行。PDF 使用 OpenHTMLtoPDF 1.0.10，中文字体按既定决定打包 Noto Sans SC，并继续执行远程资源访问限制。

`FileAccessChecker` = 根据文件所属业务记录及当前用户，判断能否下载的校验器。它覆盖工资条、合同、申诉、报价等 17 类文件，是阻断“已登录但无权看这份资料”的业务越权的核心交付。现有 `requireAccessibleFile()` 已校验租户、删除状态，并拒绝七类业务私有文件走通用访问口；仍缺统一框架和完整 17 类覆盖，不能把现状描述为完全没有保护。未注册类型默认拒绝；单有短期签名或知道文件编号不构成业务授权。

M3 必须查询真实工资、合同、供应商、资产等业务表并执行对应可见性规则。D/E/F 表和权限入口未就绪时无法证明 17 类访问规则成立；构造假表、无条件放行或返回假业务数据都会掩盖越权风险，因此后置 M3，并后置依赖它的 M4、M9、M10。

### 7.2 核验结果与计数修正

| 核验对象 | 当前结果 | G 实施后的目标或约束 |
| --- | --- | --- |
| 正式 `01` 脚本 | 44 张表 | 加本稿六张后 50 张。 |
| 正式 `01–05` 脚本 | 分别 44、45、100、87、35，合计 311 张 | 加六张后 317 张；提示词 319 的旧基线不适用。 |
| 运行库 `cloud_flow_db` | 296 张，缺少正式脚本中的 D 批 15 张新表 | 六张 G 新表目前均不存在；不能用脚本表数代替实际部署状态。 |
| 三张改动表 | `sys_file`、`sys_log`、`oa_frontend_error_log` 在脚本及运行库均存在 | 新增列分别为 8、8、1；既有 `user_agent`、前端错误 `client_ip` 均复用。 |
| `FileStorageType` | 只有 `LOCAL`、`OSS` | 按 M1 增加 `MINIO`、`S3`、`COS`。 |
| `OssProperties.accessPolicy` | 默认仍为 `"1"`；`AuthOssProperties.enabled=false` | 默认改 `"0"`，启用后配错必须启动失败，配置保存同样拒绝。 |
| 文件存储标记 | 运行库 LOCAL 1568 条、OSS 1250 条 | 记录标记无法单独证明当前 OSS 启用、桶权限或直链泄露状态，不沿用旧文档“全为 LOCAL”的结论。 |
| 菜单与权限 | `1750–1799` 无冲突；提示词权限清单展开为 13 项 | 不按文字“12 项”漏配权限；菜单和权限在后续正式阶段实施。 |

技术设计 §1 的“G3 三新表”有误，该节只有文件配置和 API 错误两表；G2 两表、G5 两表合计恰好六表，不补凑第三张 G3 表，也不沿用设计顶部“新增八张”的误数。

### 7.3 D/E/F 与字段过滤的实际状态

| 依赖 | 已核实状态 | 放行条件 |
| --- | --- | --- |
| D | 代码及隔离检查已有成果，运行库 15 张新表尚未部署；正式税率及真实微服务联调未完成 | 当前不能据此放行全量 M3；先具备真实业务结构与权限校验链路，禁止假造业务表。 |
| E | 18/18 新表已部署；真实邮件 E5-b 仍有外部阻塞 | 不能宣称 E 整批验收已闭环；M3 所需客户、业务归属与权限入口按真实实现核验。 |
| F | 25/25 新表已部署，部署记录为 `DEPLOYED_VERIFIED`，实施验收已完成 | 保留既有 33780 小时期初记录；真实客户端 IP 的运维验证待完成，不扩张 G 范围去伪造取证结果。 |
| C3 | 已找到字段权限配置实体、Mapper 和读写服务；未找到 `FormDataPermissionFilter` 或 `filterOutbound` 实际出站过滤 | M10 明确保留阻塞项，必须先核实或完成真实字段过滤依赖，不能假设配置存表即已生效。 |

核验依据：`D-批次D实施核对.md`、`E-批次E实施验收记录.md`、E/F 运行期部署记录、正式初始化脚本、相关实体及服务源码；运行库核验只读。现阶段直接阻塞 M3 完整落地的是 D 的实际表结构缺口，相关真实联调和业务可见性验收也必须完成。

## 8. 审定后的分阶段实施计划

| 阶段 | 内容 | 验收与依赖边界 |
| --- | --- | --- |
| 第一阶段：M1/M2 | 存储配置、五类存储枚举、密钥加密、强制私有；文件八列、SHA256 去重、配额与引用计数 | 批次 A 已完成。未完成业务校验器前，保留既有私有入口约束，不提前开放通用私有文件下载。 |
| 第二阶段：M5/M6 | 追踪 ID 在前端→网关→Feign 服务间调用→异步/定时任务中透传；日志增强、脱敏、前后端错误关联、全链路查询 | 同一请求可关联，线程结束清理上下文；按租户查询，敏感参数和签名凭据不入日志。 |
| 第三阶段：M7/M8 | 两张导入表、流式读取、六类校验、错误标注文件、异步调度、五个业务接入 | 只接入真实存在的业务服务；校验预览不提前写业务库，重复提交不可重复导入。 |
| 第四阶段：M11/M12 | 移动端断点、布局与五个组件、十二个组件的响应式改造 | 不以缺少业务表阻塞公共组件，但不假造移动业务数据。 |
| 第五阶段：M3/M4→M9/M10；M13 单独验收 | 完整 17 类文件校验器、签名 URL；安全模板渲染、PDF/Excel、字段过滤和四个打印场景；移动端八个场景 | M3 等 D/E/F 的真实结构和权限规则就绪；M9 等 M4；M10 等真实 C3 出站过滤；M13 等 M12、D2 打卡、E1 活动。依赖未解除则如实保留未完成项。 |

每阶段完成后执行适用的结构检查、针对性测试和构建；最终执行提示词验收用例，包含默认 Freemarker 危险模板被加固配置拒绝、实体数据包装被拒绝而 Map 能正常渲染、17 类权限边界、错误 OSS 策略启动失败、10 万行流式读取压力验证。压力验证不需要放宽 10000 行业务默认上限。

本次交付仅为本确认稿。2026-09-11 静态检查通过：六张新表、三张改表，主键与自增起点、字段注释、索引字段引用、列名对齐、配置表/流水的删除列约定均符合本稿；未发现重复新增列、物理外键或破坏性语句。正式脚本表数重新核对为 311，本稿实施后为 317。

静态检查不替代 MySQL 实际建表、应用启动或业务安全验收；本轮未连接运行库执行 DDL，也未运行应用测试，上述实施和验收项在草案审定前均不冒称完成。

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
