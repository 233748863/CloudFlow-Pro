# PRD：表单版本管理（LC-08）

| 项 | 内容 |
| --- | --- |
| 条目编号 | LC-08 |
| 所属批次 | 批次 C（第 4 份） |
| 对标依据 | `docs/benchmark/06-lowcode-bi-表单报表对标.md` |
| 优先级 | P1 —— 小改动，修一个真实的数据渲染隐患 |
| 预估工作量 | S |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题：**字段已有但保存时原地覆盖，不留历史行**

> **2026-08-31 摸排修正**：本 PRD 初版写"`wf_form_definition` **无任何版本字段**"，**这是错的**。

**实测 `wf_form_definition`（12 列）已有 4 个版本相关字段**：
```sql
version       INT        DEFAULT 1  COMMENT '版本号'
lock_version  INT        DEFAULT 1  COMMENT '乐观锁版本号'
version_lock  INT        DEFAULT 0  COMMENT '版本锁'
is_latest     TINYINT(1) DEFAULT 1  COMMENT '是否最新版本'
```

**但 `WfFormServiceImpl.saveFormDefinition()` 的实际行为**：
```java
definition.setVersion(exist.getVersion() + 1);         // 版本号递增
definition.setVersionLock(exist.getVersionLock() + 1);
definition.setIsLatest(1);                             // 恒为 1
formDefinitionMapper.updateById(definition);            // ← 原地覆盖，不留历史行
```

**精确的问题定位**：
| 字段 | 实际作用 |
| --- | --- |
| `version` | **只是递增计数器**，不产生历史版本行 |
| `is_latest` | **恒为 1，从不用于筛选**（因为表里只有一行） |
| `version_lock` | **真正生效的乐观锁**（第 97 行有并发冲突检测，会抛"表单定义已被其他用户修改"） |
| `lock_version` | 与 `version_lock` 语义重叠，用途待确认 |

**对比流程定义**：
| 对象 | 版本能力 |
| --- | --- |
| `wf_process_definition`（30 列） | `version` / `is_latest` / `checksum` / `change_log` / `change_type` / `is_rollback` / `rollback_from_version` / `current_version` + **保存时 insert 新行** —— 完整 |
| `wf_form_definition`（12 列） | 有 4 个字段但**保存时 updateById 覆盖**，缺 `checksum` / `change_log` / `change_type` / `is_rollback` / `rollback_from_version` 5 列 |

**工作量下降**：不需新增 `version`/`is_latest` 字段，**只需加 5 列 + 把保存逻辑从 `updateById` 改为 insert 新行**。原估 S → **XS**。

**后果**：表单改字段后，历史实例的表单数据可能无法正确渲染。删掉一个字段，三个月前那张审批单的该字段值就渲染不出来（数据还在 JSON 里，但没有字段定义去渲染它）。改字段类型（如 TEXT 改 SELECT）则渲染错乱。

C1 把字段结构从扁平改成树、C2 加子表、C3 加字段权限 —— **这三项都会加剧这个问题**，所以本条目应与它们同批交付。

### 1.2 目标
1. `wf_form_definition` 补齐版本机制，与流程定义口径一致
2. 实例记录发起时的表单版本，历史实例按当时版本渲染
3. 表单变更可查看差异与回滚

### 1.3 非目标
- 不做表单数据的版本迁移（历史数据保持原样，按当时版本渲染即可）
- 不做跨版本数据兼容转换

## 2. 现状基线（实测）

| 项 | 现状 |
| --- | --- |
| `wf_form_definition` | 存表单定义，`fields_json` 为 JSON 字符串；**无版本字段** |
| `WfFormServiceImpl` | 表单服务实现 |
| `FormDefinition`（前端） | `{ id, name, fields }`，无版本概念 |
| `utils/formDefinition.ts` | 解析后端定义，含容错（`fieldsJson`/`formSchema` 双字段名、非法 JSON sanitize 重试） |
| 流程定义版本机制 | 完整，可直接照搬字段设计与实现思路 |
| `wf_process_snapshot` | **已存在**，可承载表单快照 |
| `wf_process_instance` | 24 列，无 `form_version` |
| 接口 | `GET /wf/form/{formId}`、`GET /wf/forms`、`POST /wf/form/save` |

## 3. 范围

### 3.1 做
1. `wf_form_definition` 增版本字段（对齐流程定义口径）
2. `wf_process_instance` 增 `form_version`
3. 保存表单时生成新版本（而非原地覆盖）
4. 历史实例按 `form_version` 取对应版本定义渲染
5. 版本列表、版本差异对比、回滚
6. 复用 `wf_process_snapshot` 存表单快照（可选，见 §9-2）

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 表单数据迁移 | 历史数据按当时版本渲染即可，不改数据 |
| 跨版本数据转换 | 无实际收益（历史单据不需要用新表单结构展示） |
| 表单版本审批 | 流程定义有发布审批，表单暂不需要（可后续评估） |

## 4. 功能需求

### FR-1 版本字段
- FR-1.1 `wf_form_definition` **只需新增 5 列**（`version` / `is_latest` / `lock_version` / `version_lock` 已存在，复用）：
  ```
  checksum              VARCHAR(64)  字段定义的哈希（判断是否真有变更）
  change_log            VARCHAR(500) 变更说明
  change_type           VARCHAR(30)  ADD_FIELD / REMOVE_FIELD / MODIFY_FIELD / LAYOUT_CHANGE / MIXED
  is_rollback           TINYINT(1)   是否回滚产生的版本
  rollback_from_version INT          回滚来源版本
  ```
- FR-1.1B **`lock_version` 与 `version_lock` 语义重叠需澄清**：实测 `version_lock` 是真正生效的乐观锁（保存时比对并抛冲突异常），`lock_version` 用途不明。本期建议：保留 `version_lock` 作乐观锁，`lock_version` 若确无用途则在改表时删除（项目未上线可直接删）
- FR-1.2 主键策略：同一 `form_key` 多版本多行，`is_latest=1` 的为当前版本（与流程定义一致）
- FR-1.3 唯一索引 `uk_key_version(tenant_id, form_key, version)`

### FR-2 保存与版本生成（**核心改动：`updateById` → insert 新行**）
- FR-2.1 `WfFormServiceImpl.saveFormDefinition()` 行为改为：
  - 计算新 `fields_json` 的 `checksum`
  - 与最新版 `checksum` 相同 → 不产生新版本（避免无意义版本堆积），仅更新 `version_lock`
  - 不同 → **`insert` 新行**（`version+1`、`is_latest=1`），并 `update` 原最新版为 `is_latest=0`
  - **保留现有 `version_lock` 并发冲突检测**（第 97 行逻辑不动）
- FR-2.1B **主键影响**：现有 `wf_form_definition` 主键是 `form_id VARCHAR(64)` 单列。改为多版本多行后，`form_id` 不能再作主键。需改为：
  - 新增自增 `id BIGINT` 作主键
  - `form_id` 降级为业务键，与 `version` 组成唯一索引 `uk_form_version(tenant_id, form_id, version)`
  - **这是本条目唯一的表结构破坏性变更**，项目未上线可直接改
- FR-2.2 自动推导 `change_type`：对比字段集合，判断是新增/删除/修改字段还是仅布局调整
- FR-2.3 `change_log` 可由用户填写，未填则自动生成（如"新增 2 个字段，删除 1 个字段"）

### FR-3 实例绑定版本
- FR-3.1 `wf_process_instance` 增 `form_version INT`
- FR-3.2 发起流程时记录当时表单的 `version`
- FR-3.3 查询实例表单定义时按 `form_version` 取对应版本（而非取最新版）
- FR-3.4 `form_version` 为空的历史实例（改造前数据）按最新版渲染并在界面提示"表单版本未知"
  - 注：项目未上线，实际不存在此类数据，但接口需容错

### FR-4 版本管理接口
- FR-4.1 版本列表：`GET /wf/form/{formKey}/versions`，返回各版本号、变更类型、变更说明、创建人、创建时间、是否最新
- FR-4.2 版本详情：`GET /wf/form/{formKey}/versions/{version}`
- FR-4.3 版本差异：`GET /wf/form/{formKey}/versions/compare?from=&to=`
  - 返回字段级差异：新增字段列表、删除字段列表、修改字段列表（含修改前后的属性对比）
  - 布局变更单独标注
- FR-4.4 回滚：`POST /wf/form/{formKey}/rollback/{version}`
  - 以目标版本内容创建新版本（`is_rollback=1`、`rollback_from_version=目标版本`），**不删除中间版本**
  - 与流程定义回滚语义一致

### FR-5 前端
- FR-5.1 `FormDesign.tsx` 增版本下拉：可切换查看历史版本（只读）
- FR-5.2 保存时弹窗填写变更说明
- FR-5.3 版本历史抽屉：版本列表 + 差异对比视图（复用现有 `VersionHistory.tsx` / `VersionHistoryPage.tsx` 的交互模式）
- FR-5.4 差异视图高亮：新增字段绿色、删除字段红色、修改字段黄色（**用 `--cf-chart-good/critical/warning` 语义色，带文字标签**，遵守批次 A LC-05 的色板规则 6）
- FR-5.5 回滚二次确认

## 5. 非功能需求

| 项 | 要求 |
| --- | --- |
| 命名一致性 | 版本字段命名与 `wf_process_definition` 完全一致，避免两套口径 |
| checksum 稳定性 | 哈希计算需对字段顺序无关部分做归一化（如属性键排序），避免格式变化产生假版本 |
| 版本数量 | 无硬上限，但需提供清理策略（保留最近 N 版 + 被实例引用的版本，见 §9-3） |
| 查询性能 | 按 `form_key` + `is_latest` 查最新版需索引；按 `version` 精确查需索引 |
| 引用完整性 | **被实例引用的版本不可物理删除**（否则历史实例渲染不出） |
| 行为兼容 | 改造后现有表单查询接口默认仍返回最新版，调用方无感 |

## 6. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 保存表单产生新版本，原版本 `is_latest=0` |
| AC-2 | 内容未变（checksum 相同）时保存不产生新版本 |
| AC-3 | `change_type` 自动推导正确（新增/删除/修改字段、仅布局变更） |
| AC-4 | 发起流程时 `wf_process_instance.form_version` 正确记录 |
| AC-5 | **删除表单某字段后，历史实例仍能正确渲染该字段的值**（本条目的核心价值） |
| AC-6 | 修改字段类型后（TEXT→SELECT），历史实例按旧类型渲染不错乱 |
| AC-7 | 版本列表、版本详情、版本差异接口返回正确 |
| AC-8 | 差异对比正确识别新增/删除/修改字段，含子表列变更 |
| AC-9 | 回滚产生新版本且标记 `is_rollback`，中间版本保留 |
| AC-10 | 被实例引用的版本无法物理删除 |
| AC-11 | 现有表单查询接口默认返回最新版，调用方行为不变 |
| AC-12 | 差异视图配色用语义色且带文字标签（不只靠颜色区分） |

## 7. 依赖与风险

### 7.1 依赖
| 依赖 | 说明 |
| --- | --- |
| **C1 / C2 / C3** | 三者都改表单结构，本条目应在其后交付（或同批），否则版本机制刚建又要改结构 |
| 现有流程定义版本机制 | 直接照搬字段设计与实现 |
| `wf_process_snapshot`（已有） | 可选用于表单快照 |
| 现有 `VersionHistory.tsx` | 前端交互模式复用 |
| 批次 A LC-05 语义色 | 差异视图配色 |

### 7.2 风险

| 风险 | 应对 |
| --- | --- |
| checksum 计算不稳定导致每次保存都产生新版本 | 归一化处理（属性键排序、去除无意义空白）；AC-2 验证 |
| 版本膨胀（频繁保存产生大量版本） | AC-2 的 checksum 去重是主要手段；另提供清理策略（§9-3） |
| 历史实例渲染仍出错（版本取对了但结构变化太大） | AC-5/6 覆盖；C1 的树形结构改造后，旧扁平结构版本需能正确解析（`formDefinition.ts` 的容错逻辑要保留并扩展） |
| 与 C3 字段权限的版本联动 | C3 的权限记录也需随版本走（C3 FR-1.3 已要求随流程定义版本复制）；两者版本口径需对齐 |
| 顺序风险：若本条目先于 C1 交付，版本机制会被 C1 的结构改造推翻 | **本条目必须在 C1/C2/C3 之后交付**（依赖已列） |

## 8. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 表结构改动 + checksum 计算 + 保存产生新版本 | AC-1/2 |
| M2 | `change_type` 推导 + 实例绑定 `form_version` | AC-3/4 |
| M3 | 历史实例按版本渲染（**核心价值**） | AC-5/6/11 |
| M4 | 版本列表/详情/差异/回滚接口 | AC-7/8/9/10 |
| M5 | 前端版本切换 + 差异视图 + 回滚确认 | AC-12 |

## 9. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 表单版本是否需要发布审批（对齐流程定义的发布审批） | 建议本期不做。表单变更影响面小于流程变更，且有版本与回滚已足够；若后续发现误改频繁再加 |
| 2 | 是否复用 `wf_process_snapshot` 存表单快照 | 建议**不复用**：表单版本表本身已能通过 `form_version` 精确定位定义，再存快照是冗余。`wf_process_snapshot` 保持只存流程模型快照 |
| 3 | 版本清理策略 | 建议：保留最近 20 版 + 全部被实例引用的版本；清理作为内置任务（批次 A SYS-02 纳管） |
| 4 | 交付顺序 | 建议放在批次 C 最后（C1→C2→C3→C4）。若要提前，至少在 C1 之后 |
