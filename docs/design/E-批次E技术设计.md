# 批次 E 技术设计（CRM 客户经营）

| 项 | 内容 |
| --- | --- |
| 覆盖 | E1（活动管理）· E2（SLA）· E3（丢单+额度）· E4（线索资质）· E5（营销闭环，部分阻塞） |
| 表改动 | **新增 18 张**，改 4 张 |
| 摸排结论 | 经 PRD 与脚本核验修正表数、画像列数与效果计数，见下方获批口径 |
| 版本 | v2 · 2026-09-08 |

实施确认：用户批准按 E1–E5 PRD 的 18 张表落地，撤销原汇总未定义的“关联表二”；CRM 为 35 表，全库为 287 表。线索新增 16 列、客户新增 6 列，金额 `DECIMAL(16,2)`、SLA 整数分钟，营销计数 9 项、ROI `DECIMAL(20,4)`。OA 现有日程与签到表缺少共同状态字段，用户批准 CRM 采用 E/H4 已定标准，OA 补字段留 H4。完整确认依据见 `E-批次E-DDL确认草案.md`；本文件中的算法片段为设计示意，实际事务、校验和字段以实现为准。

## 0. CRM 模块规范（实测提取）

```sql
主键：    xxx_id  BIGINT(20)  NOT NULL AUTO_INCREMENT COMMENT 'xxxID'
列对齐：  列名 18 字符宽（比 common 的 17 宽 1）
租户：    tenant_id  BIGINT(20)  DEFAULT 100000
逻辑删除：deleted  TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)'
乐观锁：  version  INT（业务表有，明细表如 crm_quote_line 无）
审计：    create_by / create_time / update_by / update_time
```

**可复用的现有模式**（摸排发现）：`CrmHealthCalculator` 用 `SysDictHelper` 加载 `crm_receivable_overdue_tier` 字典做档位，缺失时回退内置值。**E2 的 SLA 优先级分档与 F2 的供应商评分分档应复用此模式**，而非硬编码阈值。

---

## 1. E1 活动管理（3 新表）

### 1.1 `crm_activity`

```sql
-- 18. CRM 活动表
DROP TABLE IF EXISTS crm_activity;
CREATE TABLE crm_activity (
  activity_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '活动ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  activity_no        VARCHAR(64)     DEFAULT NULL COMMENT '活动编号',
  activity_type      VARCHAR(20)     NOT NULL COMMENT 'MEETING会议/CALL通话/TASK任务',
  subject            VARCHAR(200)    NOT NULL COMMENT '主题',
  description        VARCHAR(2000)   DEFAULT NULL COMMENT '说明',
  status             VARCHAR(20)     NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED/IN_PROGRESS/COMPLETED/CANCELLED/NOT_HELD',
  priority           VARCHAR(20)     DEFAULT 'MEDIUM' COMMENT 'HIGH/MEDIUM/LOW',
  direction          VARCHAR(20)     DEFAULT NULL COMMENT 'INBOUND/OUTBOUND（CALL用）',
  start_time         DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time           DATETIME        DEFAULT NULL COMMENT '结束时间',
  all_day_flag       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否全天',
  duration_minutes   INT             DEFAULT NULL COMMENT '时长（分钟）',
  biz_type           VARCHAR(30)     DEFAULT 'NONE' COMMENT '挂载类型：CUSTOMER/OPPORTUNITY/LEAD/TICKET/CONTRACT/QUOTE/NONE',
  biz_id             BIGINT(20)      DEFAULT NULL COMMENT '挂载对象ID',
  customer_id        BIGINT(20)      DEFAULT NULL COMMENT '客户ID（冗余，便于按客户查）',
  customer_name      VARCHAR(200)    DEFAULT NULL COMMENT '客户名称',
  owner_id           BIGINT(20)      DEFAULT NULL COMMENT '负责人ID',
  owner_name         VARCHAR(64)     DEFAULT NULL COMMENT '负责人姓名',
  dept_id            BIGINT(20)      DEFAULT NULL COMMENT '部门ID（数据权限用）',
  location           VARCHAR(300)    DEFAULT NULL COMMENT '地点',
  join_url           VARCHAR(500)    DEFAULT NULL COMMENT '线上会议链接',
  meeting_platform   VARCHAR(50)     DEFAULT NULL COMMENT '会议平台',
  result_summary     VARCHAR(1000)   DEFAULT NULL COMMENT '结果纪要',
  next_action        VARCHAR(500)    DEFAULT NULL COMMENT '后续动作',
  complete_time      DATETIME        DEFAULT NULL COMMENT '完成时间',
  overdue_flag       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否逾期（TASK用）',
  attachment_url     VARCHAR(1000)   DEFAULT NULL COMMENT '附件',
  follow_up_id       BIGINT(20)      DEFAULT NULL COMMENT '关联生成的跟进记录ID',
  deleted            TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version            INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by          VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time        DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (activity_id),
  KEY idx_crmact_biz (tenant_id, biz_type, biz_id),
  KEY idx_crmact_customer (tenant_id, customer_id),
  KEY idx_crmact_owner_time (owner_id, start_time),
  KEY idx_crmact_status_time (tenant_id, status, start_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='CRM活动表';
```

### 1.2 `crm_activity_participant` 与 `crm_activity_reminder`

```
crm_activity_participant：activity_id / participant_type(USER/CONTACT/LEAD) / participant_ref_id /
                          participant_name / is_organizer_flag / acceptance_status / response_time / attend_flag
crm_activity_reminder：   activity_id / remind_minutes_before / channel_type / sent_flag /
                          send_time / message_record_id（关联批次 A 的 sys_message_record）
```

**`acceptance_status` 取值必须与 H4 的 OA-07 一致**（E1 的 §9-1 对齐要求）：`NONE / ACCEPTED / DECLINED / TENTATIVE`
**`status` 取值同样对齐**：`PLANNED / IN_PROGRESS / COMPLETED / CANCELLED / NOT_HELD`

### 1.3 提醒的改期取消（AC-6，最易错处）

```java
@Transactional
public void updateActivity(CrmActivity act) {
    CrmActivity old = activityMapper.selectById(act.getActivityId());
    activityMapper.updateById(act);

    // 时间变了 → 未发送的提醒全部取消重排
    if (!Objects.equals(old.getStartTime(), act.getStartTime())) {
        reminderMapper.deleteUnsentByActivity(act.getActivityId());   // sent_flag=0 的删掉
        rescheduleReminders(act);
    }
}

@Transactional
public void cancelActivity(Long activityId) {
    activityMapper.updateStatus(activityId, "CANCELLED");
    reminderMapper.deleteUnsentByActivity(activityId);   // 取消后不再提醒
}
```

### 1.4 客户 360 时间线（聚合查询，不建冗余表）

按 E1 的 §9-5 建议，用 union 聚合而非 `crm_trace_event`：

```java
public List<TimelineItemVO> customerTimeline(Long customerId, TimelineQuery q) {
    List<TimelineItemVO> items = new ArrayList<>();
    items.addAll(activityMapper.selectTimeline(customerId, q));      // 活动
    items.addAll(followUpMapper.selectTimeline(customerId, q));      // 跟进
    items.addAll(opportunityMapper.selectStageTimeline(customerId, q)); // 商机阶段变更
    items.addAll(quoteMapper.selectTimeline(customerId, q));
    items.addAll(receivableMapper.selectTimeline(customerId, q));
    items.addAll(ticketMapper.selectTimeline(customerId, q));
    items.sort(comparing(TimelineItemVO::getEventTime).reversed());
    return paginate(items, q);
}
```

各 Mapper 的 `selectTimeline` 写在 XML 里（项目禁 Java 拼 SQL），返回统一结构。

---

## 2. E2 SLA（3 新表 + 1 改表）

### 2.1 三张表

```
crm_sla_policy       policy_code/policy_name/entity_type(GLOBAL/CUSTOMER/CUSTOMER_LEVEL/INDUSTRY)/
                     entity_id/holiday_calendar_id/apply_for_resolution/round_the_clock_flag/
                     default_flag/priority/effective_start/effective_end/status
crm_sla_priority     policy_id/priority_code/priority_name/first_response_minutes/resolution_minutes/sort_no
crm_sla_status_rule  policy_id/rule_type(PAUSE/FULFILL)/ticket_status
```

**`round_the_clock_flag`** 是 E2 的 §10-3 待确认项的落地：为真时按自然时间计算（紧急工单需要），不走工作日历。

### 2.2 `crm_service_ticket` 增 11 列

```sql
  sla_policy_id           BIGINT(20)  DEFAULT NULL COMMENT '匹配的SLA策略ID',
  first_response_due      DATETIME    DEFAULT NULL COMMENT '首次响应到期时间',
  resolution_due          DATETIME    DEFAULT NULL COMMENT '解决到期时间',
  first_response_time     DATETIME    DEFAULT NULL COMMENT '实际首次响应时间',
  first_response_minutes  INT         DEFAULT NULL COMMENT '实际响应用时（工作分钟）',
  resolution_minutes      INT         DEFAULT NULL COMMENT '实际解决用时（工作分钟）',
  sla_paused_minutes      INT         NOT NULL DEFAULT 0 COMMENT '累计暂停分钟',
  pause_start_time        DATETIME    DEFAULT NULL COMMENT '当前暂停开始时间（未暂停为空）',
  sla_status              VARCHAR(30) DEFAULT 'NOT_APPLICABLE' COMMENT 'NOT_APPLICABLE/ONGOING/PAUSED/RESPONSE_BREACHED/RESOLUTION_BREACHED/FULFILLED',
  response_breached_flag  TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '响应违约',
  resolution_breached_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '解决违约',
```

### 2.3 SLA 计时引擎

```java
@Service
public class CrmSlaService {

    /** 工单创建时：匹配策略 + 反算到期时间 */
    public void initSla(CrmServiceTicket ticket) {
        CrmSlaPolicy policy = matchPolicy(ticket);      // 客户 > 等级 > 行业 > 全局
        if (policy == null) { ticket.setSlaStatus("NOT_APPLICABLE"); return; }

        CrmSlaPriority pri = priorityMapper.selectByPolicyAndCode(policy.getPolicyId(), ticket.getSeverity());
        if (pri == null) { ticket.setSlaStatus("NOT_APPLICABLE"); return; }

        LocalDateTime from = ticket.getOpenedTime();
        ticket.setFirstResponseDue(addWorkMinutes(policy, from, pri.getFirstResponseMinutes()));
        if (Boolean.TRUE.equals(policy.getApplyForResolution())) {
            ticket.setResolutionDue(addWorkMinutes(policy, from, pri.getResolutionMinutes()));
        }
        ticket.setSlaPolicyId(policy.getPolicyId());
        ticket.setSlaStatus("ONGOING");
    }

    /** 加工作分钟：正向推算到期时刻 */
    private LocalDateTime addWorkMinutes(CrmSlaPolicy policy, LocalDateTime from, int minutes) {
        if (Boolean.TRUE.equals(policy.getRoundTheClockFlag())) {
            return from.plusMinutes(minutes);       // 7×24
        }
        // 走批次 A 的日历，逐日累加工作分钟直到耗尽
        return holidayService.addWorkMinutes(policy.getHolidayCalendarId(), from, minutes);
    }

    /** 状态变更时：暂停/恢复/履约判定 */
    @Transactional
    public void onStatusChange(CrmServiceTicket ticket, String oldStatus, String newStatus) {
        CrmSlaPolicy policy = policyMapper.selectById(ticket.getSlaPolicyId());
        if (policy == null) return;

        boolean wasPaused = isPauseStatus(policy, oldStatus);
        boolean nowPaused = isPauseStatus(policy, newStatus);

        if (!wasPaused && nowPaused) {
            ticket.setPauseStartTime(LocalDateTime.now());
            ticket.setSlaStatus("PAUSED");
        } else if (wasPaused && !nowPaused) {
            // 恢复：累加暂停时长并顺延到期时间（AC-6）
            int paused = (int) holidayService.calcWorkMinutes(
                    policy.getHolidayCalendarId(), ticket.getPauseStartTime(), LocalDateTime.now());
            ticket.setSlaPausedMinutes(ticket.getSlaPausedMinutes() + paused);
            ticket.setFirstResponseDue(addWorkMinutes(policy, ticket.getFirstResponseDue(), paused));
            ticket.setResolutionDue(addWorkMinutes(policy, ticket.getResolutionDue(), paused));
            ticket.setPauseStartTime(null);
            ticket.setSlaStatus("ONGOING");
        }

        if (isFulfillStatus(policy, newStatus)) {
            judgeFulfilment(ticket, policy);
        }
    }
}
```

**服务重启后暂停不丢**（AC-7）：`pause_start_time` 落库而非内存态。

### 2.4 改造现有提醒任务（AC-11）

`CrmNotificationServiceImpl.dispatchTicketSlaDue()` 现在用 `ticketSlaReminderHours()` 配置窗口。改为读真实字段：

```java
public int dispatchTicketSlaDue() {
    // 改前：LocalDateTime reminderWindow = now.plusHours(ticketSlaReminderHours());
    // 改后：按到期时间的 80% 与到期时各提醒一次
    List<CrmServiceTicket> approaching = ticketMapper.selectSlaApproaching(0.8);
    List<CrmServiceTicket> due = ticketMapper.selectSlaDue();
    ...
}
```

该方法内的两个 `@Scheduled` 由批次 A SYS-02 纳管（`crmDailyDispatch` / `ticketSlaDispatch`，已在批次 A 的 20 条种子里）。

---

## 3. E3 丢单与额度（4 新表）

```
crm_lost_reason              reason_code/reason_name/reason_category/sort_no/status
crm_competitor               competitor_code/competitor_name/website/industry/scale/
                             strength/weakness/our_advantage/our_disadvantage/threat_level/status
crm_opportunity_lost_detail  opportunity_id/lost_reason_id/competitor_id/amount_lost/is_primary_flag/remark
crm_customer_credit          customer_id/credit_limit/overdue_threshold/currency/
                             bypass_flag/bypass_reason/bypass_by/bypass_time/bypass_expire_date/
                             effective_start/effective_end/status/instance_id
```

### 3.1 额度校验接入规则中心

```java
@Service
public class CrmCreditCheckService {

    public void checkBeforeQuote(Long customerId, BigDecimal newAmount) {
        CrmCustomerCredit credit = creditMapper.selectByCustomer(customerId);
        if (credit == null) return;                          // 未设额度不校验

        // bypass 有效期内跳过，但仍记命中（AC-15）
        if (Boolean.TRUE.equals(credit.getBypassFlag())
            && (credit.getBypassExpireDate() == null
                || !credit.getBypassExpireDate().isBefore(LocalDate.now()))) {
            ruleHitService.record("crm.credit.limit", customerId, "BYPASSED");
            return;
        }

        BigDecimal occupied = receivableMapper.sumOutstanding(customerId);
        BigDecimal overdue  = receivableMapper.sumOverdue(customerId);

        // 走现有规则中心（三态 BLOCK/WARN/PASS + 版本 + 命中记录）
        businessRuleService.evaluate("crm.credit.overdue",
                overdue, credit.getOverdueThreshold(), ctx -> {
            throw new CrmBusinessException("CREDIT_OVERDUE_BLOCKED",
                    String.format("客户超期欠款 %s 超过阈值 %s", overdue, credit.getOverdueThreshold()));
        });
        businessRuleService.evaluate("crm.credit.limit",
                occupied.add(newAmount), credit.getCreditLimit(), ctx -> {
            throw new CrmBusinessException("CREDIT_LIMIT_BLOCKED", "超出客户信用额度");
        });
    }
}
```

**三个校验点**：`POST /crm/quote/submit/{id}`、`POST /crm/quote/{id}/contract-draft`、`POST /crm/customer/{id}/workspace/contract-draft`

**规则码**（写入 `06` 种子）：`crm.credit.limit`（默认 WARN）、`crm.credit.overdue`（默认 BLOCK）

实施口径：按 E3 PRD 的本期单币种约束，额度申请与占用核算仅支持人民币 `CNY`，`currency` 保留扩展位置；当前应收表没有币种列，不支持将其他币种与人民币余额相加。额度审批回调只更新本次申请字段，保留审批期间独立修改的临时放行信息；新申请审批期间，旧额度继续生效。

---

## 4. E4 线索资质（2 新表 + 2 改表）

```
crm_territory        territory_code/territory_name/parent_id/level_path/sort_no/owner_id/status
crm_lead_score_rule  rule_name/field_name/operator/field_value/score/enabled_flag/sort_no
```

`crm_lead` 增 16 列、`crm_customer` 增 6 列（E4 字段清单及 E5 客户营销来源，已获批）。

**树形用 `level_path` 物化路径**（与项目其他树形一致，不用 lft/rgt）：
```java
// 保存时维护
String levelPath = parent == null ? "/" + id + "/" : parent.getLevelPath() + id + "/";
// 查子树
wrapper.likeRight(CrmTerritory::getLevelPath, node.getLevelPath());
```

**转化字段映射**（AC-8）：
```java
private void mapLeadToCustomer(CrmLead lead, CrmCustomer customer) {
    customer.setTerritoryId(lead.getTerritoryId());
    customer.setMarketSegment(lead.getMarketSegment());
    customer.setIndustry(lead.getIndustry());
    customer.setEmployeeScale(lead.getEmployeeScale());
    customer.setAnnualRevenue(lead.getAnnualRevenue());
    customer.setSource(lead.getSource());
    customer.setCampaignId(lead.getCampaignId());
    customer.setUnsubscribeFlag(lead.getUnsubscribeFlag());
}
```

**「只有 QUALIFIED 可转化」**（AC-4）：`POST /crm/lead/convert` 入口加校验，走 `sys_business_rule` 的 `crm.lead.qualify.required`（默认 BLOCK，可改 WARN）。

---

## 5. E5 营销闭环（6 新表，拆两段）

### 5.1 E5-a 不阻塞部分（4 表 + 1 改表）

```
crm_campaign              含 budget/actual_cost/revenue + 9 个效果计数字段 + 4 个率字段 + roi
crm_target_list           list_code/list_name/source_type(MANUAL/QUERY)/query_condition/member_count
crm_target_list_member    list_id/member_type/member_ref_id/member_name/email/phone/opted_out_flag
crm_campaign_target_list  campaign_id/list_id/is_excluding_flag        ← 关联表，支持排除名单
```

`crm_opportunity` 增 `campaign_id`。

**ROI 归因（E5-a 的核心价值，不需邮件）**：
```java
/** 归因：活动 → 线索 → 商机 → 赢单 → 回款 */
public void recalcCampaignRevenue(Long campaignId) {
    CrmCampaign c = campaignMapper.selectById(campaignId);
    int windowDays = sysConfigService.getInt("crm.campaign.attribution.window.days", 30);

    // 归因窗口：活动期间 + N 天内创建的线索
    LocalDateTime from = c.getStartDate().atStartOfDay();
    LocalDateTime to   = c.getEndDate().plusDays(windowDays).atTime(23,59,59);

    BigDecimal revenue = receivableMapper.sumReceivedByCampaign(campaignId, from, to);
    c.setRevenue(revenue);
    if (c.getActualCost() != null && c.getActualCost().signum() > 0) {
        c.setRoi(revenue.subtract(c.getActualCost())
                        .divide(c.getActualCost(), 4, RoundingMode.HALF_UP));
    }
    campaignMapper.updateById(c);
}
```

`campaign_type` 的 `EVENT` / `WEBINAR` / `EXHIBITION` 三类**不需要发送能力**，线索手工录入关联活动即可做归因。

### 5.2 E5-b 阻塞部分（2 表，等邮件渠道）

```
crm_mass_email     campaign_id/subject/template_code/from_address/scheduled_time/status/
                   total_count/sent_count/failed_count
crm_campaign_log   campaign_id/mass_email_id/action(SENT/DELIVERED/OPENED/CLICKED/BOUNCED/
                   UNSUBSCRIBED/LEAD_CREATED/OPPORTUNITY_CREATED/WON)/action_time/
                   target_type/target_id/target_email/click_url/user_agent/ip_address/
                   message_record_id/test_flag
```

**追踪端点安全**（E5-b 的 AC-11/12，最高风险项）：
```java
@GetMapping("/crm/track/click")
public void trackClick(@RequestParam String token, HttpServletResponse resp) {
    // ① token 不可预测（随机 32 位，非自增 ID）
    ClickToken t = trackTokenService.parse(token);
    if (t == null) { resp.setStatus(404); return; }        // 不回显任何信息

    // ② 跳转目标白名单校验（防开放重定向）
    if (!urlWhitelistService.isAllowed(t.getTargetUrl())) {
        log.warn("点击追踪目标不在白名单: {}", t.getTargetUrl());
        resp.setStatus(400); return;
    }
    campaignLogService.record(t, "CLICKED", request);
    resp.sendRedirect(t.getTargetUrl());
}
```
限流复用 `sys_api_ratelimit_rule`（新增规则 `path_pattern=/crm/track/**`）。

---

## 6. 表数变化

| 脚本 | 改前 | 改后 | 变化 |
| --- | --- | --- | --- |
| `05.cloudflow-crm.sql` | 17 | **35** | +18（E1 三 + E2 三 + E3 四 + E4 二 + E5 六） |
| 全库 | 269（批次 D 后） | **287** | +18 |

**改动表**：`crm_service_ticket`(+11列) / `crm_lead`(+16列) / `crm_customer`(+6列) / `crm_opportunity`(+campaign_id、+competitor_id)。多原因丢单明细保存于 `crm_opportunity_lost_detail`。

---

## 7. 新增内置任务

| handler | 频率 | 用途 |
| --- | --- | --- |
| `crmActivityReminder` | FIXED_RATE 5min | 扫描待发提醒 |
| `crmActivityOverdue` | 每日 6:00 | TASK 类活动逾期标记 |
| `crmSlaBreachScan` | FIXED_RATE 10min | SLA 违约检测与告警 |
| `crmCampaignRevenueRecalc` | 每日 4:00 | ROI 归因重算 |
| `crmCampaignCountAggregate` | 每日 4:30 | 效果计数与日志对账（E5-b） |

---

## 8. 实施顺序

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| M1 | E1 三表 + 活动 CRUD + 多态挂载 | 批次 A |
| M2 | E1 提醒（含改期取消）+ 日历视图 + 时间线聚合 | M1、批次 A SYS-01/SYS-02 |
| M3 | E2 三表 + 策略匹配 + **计时引擎**（接批次 A 日历） | 批次 A A4 |
| M4 | E2 暂停恢复 + 履约判定 + 改造现有提醒任务 | M3 |
| M5 | E3 四表 + 丢单结构化 + Dashboard 图表 | 批次 A LC-05 |
| M6 | E3 额度校验接规则中心（三个校验点 + bypass） | M5 |
| M7 | E4 两表 + 线索 16 列 + 客户 6 列 + 资质判定 + 区域树 | — |
| M8 | E4 评分规则 + 转化映射 | M7 |
| M9 | **E5-a**：四表 + campaign_id 关联 + ROI 归因 + 报表 | M8（用 E4 的分层字段做条件筛选名单） |
| M10 | ⛔ **E5-b**：群发 + 追踪 + 退订（**等邮件渠道**） | 邮件渠道就绪 |

---

## 9. 待确认

**4 项已定案，1 项随实施再定**（见 `01-决策汇总.md` §5）：

| # | 问题 | ✅ 决策 |
| --- | --- | --- |
| 1 | 活动模型是否与 OA 合并 | **不合并，只对齐取值**。理由：CRM 活动挂客户（`customer_id` + `biz_type` 多态挂载 + 参会人含客户联系人），OA 日程挂内部事务（会议室 + 纪要 + 签到），字段差异大。**但 `status` 五值与 `acceptance_status` 四值必须一致**（H4 的第一验收项） |
| 2 | SLA 分档是否字典驱动 | **字典驱动 + 内置回退**（复用 `CrmHealthCalculator` 的 `SysDictHelper` 模式），新增字典 `crm_sla_priority_tier`。F2 供应商评分分档用同一模式 |
| 3 | 优先级取值统一 | **统一为 `P1/P2/P3/P4`**，用 `sys_dict_data` 承载。⚠️ 现有 `crm_service_ticket.severity` 取值需先摸排再统一改 |
| 4 | 时间线聚合性能 | **先用 6 表 union**，不建 `crm_trace_event` 冗余表。理由：单客户通常 < 500 条，内存排序开销可忽略；不维护冗余表。大客户出现后再优化为各表 TOP N 合并 |
| 5 | E5-b 追踪链接域名 | ⏸ **暂不定**，随 E5-b 实施时一起定（E5-b 已因邮件渠道阻塞） |

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
