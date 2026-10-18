package com.cloudflow.workflow.job;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.workflow.domain.WfReconcileAlert;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.mapper.WfReconcileAlertMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProcessBusinessReconcileJob {

    private static final String EVENT_RECONCILE_ALERT = "WORKFLOW_RECONCILE_ALERT";
    private static final int MAX_NOTIFICATION_RECIPIENTS = 20;

    private final WfReconcileAlertMapper reconcileAlertMapper;
    private final BusinessTypeRegistry businessTypeRegistry;
    private final JdbcTemplate jdbcTemplate;
    private final MessageSender messageSender;
    private final SysRoleMapper sysRoleMapper;
    private final SysUserRoleMapper sysUserRoleMapper;
    private final SysUserMapper sysUserMapper;
    private final TransactionTemplate transactionTemplate;

    /**
     * 当前运行库中可参与对账的业务类型缓存。
     *
     * <p>BusinessTypeRegistry 是跨模块"期望注册表"，但本地数据库可能处于灰度 / dry-run /
     * 部分业务模块未执行 DDL 的状态。对账 SQL 使用 UNION ALL，任一表或列不存在都会使整条 SQL 失败；
     * 因此运行前必须按实际 schema 过滤一次，保证 M4 reconcile 以"可对账项继续对账、缺表项跳过告警"方式运行。
     */
    private final Set<String> queryableBusinessTypeCache = ConcurrentHashMap.newKeySet();
    private final Set<String> skippedBusinessTypeCache = ConcurrentHashMap.newKeySet();

    @JobHandler(value = "processBusinessReconcile", desc = "流程业务对账")
    @DistributedJob(name = "processBusinessReconcile", lockTime = 240)
    public JobResult reconcile() {
        List<RuntimeException> failures = new ArrayList<>();
        List<BusinessTypeDef> queryableTypes = new ArrayList<>();
        for (BusinessTypeDef definition : businessTypeRegistry.all()) {
            try {
                if (isQueryableBusinessType(definition)) queryableTypes.add(definition);
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("对账业务表检查失败：" + definition.getCode(), exception));
            }
        }
        // 仅发现差异时跨租户读取；告警和消息必须在业务行所属租户共同提交。
        List<WfReconcileAlert> inconsistent = queryableTypes.isEmpty() ? List.of()
                : TenantBroker.applyWithoutTenant(ignored -> reconcileAlertMapper.selectInconsistentRecords(7, queryableTypes));
        int created = 0;
        for (WfReconcileAlert alert : inconsistent) {
            try {
                if (alert.getTenantId() == null || alert.getTenantId() <= 0) {
                    throw new IllegalStateException("对账差异缺少有效租户");
                }
                Integer count = TenantBroker.applyAs(alert.getTenantId(), tenantId -> transactionTemplate.execute(status -> {
                    alert.setId(null);
                    alert.setDetectedAt(LocalDateTime.now());
                    alert.setCreateTime(LocalDateTime.now());
                    try {
                        if (reconcileAlertMapper.insert(alert) != 1) throw new IllegalStateException("对账告警未成功保存");
                    } catch (DuplicateKeyException duplicate) {
                        // 只忽略告警自身 uk_reconcile_open 冲突，通知阶段的异常仍须回滚和上报。
                        status.setRollbackOnly();
                        return 0;
                    }
                    notifyReconcileAlert(alert);
                    return 1;
                }));
                created += count == null ? 0 : count;
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("对账告警处理失败，租户：" + alert.getTenantId()
                        + "，流程：" + alert.getWfInstanceId(), exception));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("流程业务对账存在失败项：" + failures.size() + "项");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return JobResult.success(created, "流程业务对账完成：新增" + created + "条告警");
    }

    private void notifyReconcileAlert(WfReconcileAlert alert) {
        Set<Long> recipients = resolveNotificationRecipients(alert);
        if (recipients.isEmpty()) {
            log.warn("[对账] 未找到告警通知接收人: wfInstanceId={}, bizModule={}, tenantId={}",
                    alert.getWfInstanceId(), alert.getBizModule(), alert.getTenantId());
            return;
        }
        String title = "流程业务状态对账告警";
        String content = "流程实例 %s 与 %s 单据 %s 状态不一致：业务=%s，流程=%s，请在对账告警中人工处理。"
                .formatted(alert.getWfInstanceId(), alert.getBizModule(), alert.getBizId(),
                        alert.getBizStatus(), alert.getWfStatus());
        for (Long recipient : recipients) {
            messageSender.send(MessageSendRequest.legacy(recipient, title, content, "1", null, "系统").toBuilder()
                    .bizType(EVENT_RECONCILE_ALERT).bizId(String.valueOf(alert.getId()))
                    .deduplicationKey("wf:reconcile:" + alert.getId() + ":" + recipient).build());
        }
    }

    private Set<Long> resolveNotificationRecipients(WfReconcileAlert alert) {
        Set<Long> recipients = new LinkedHashSet<>();
        Long tenantId = alert == null ? null : alert.getTenantId();
        addRoleUsers(recipients, tenantId, "admin");
        String moduleRole = resolveModuleAdminRole(alert == null ? null : alert.getBizModule());
        if (StringUtils.hasText(moduleRole)) {
            addRoleUsers(recipients, tenantId, moduleRole);
        }
        return recipients;
    }

    private String resolveModuleAdminRole(String bizModule) {
        if (!StringUtils.hasText(bizModule)) {
            return null;
        }
        return switch (bizModule.toLowerCase(Locale.ROOT)) {
            case "oa" -> "oa_clerk";
            case "crm" -> "crm_ops";
            case "hr" -> "hr";
            case "workflow" -> "manager";
            default -> null;
        };
    }

    private void addRoleUsers(Set<Long> recipients, Long tenantId, String roleKey) {
        if (recipients.size() >= MAX_NOTIFICATION_RECIPIENTS || !StringUtils.hasText(roleKey)) {
            return;
        }
        LambdaQueryWrapper<SysRole> roleWrapper = new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getRoleKey, roleKey)
                .eq(SysRole::getStatus, "0")
                .eq(SysRole::getDeleted, 0);
        if (tenantId != null) {
            roleWrapper.eq(SysRole::getTenantId, tenantId);
        }
        SysRole role = sysRoleMapper.selectPage(new Page<>(1, 1, false), roleWrapper)
                .getRecords().stream().findFirst().orElse(null);
        if (role == null) {
            return;
        }

        LambdaQueryWrapper<SysUserRole> userRoleWrapper = new LambdaQueryWrapper<SysUserRole>()
                .eq(SysUserRole::getRoleId, role.getRoleId());
        if (tenantId != null) {
            userRoleWrapper.eq(SysUserRole::getTenantId, tenantId);
        }
        List<Long> userIds = sysUserRoleMapper.selectList(userRoleWrapper).stream()
                .map(SysUserRole::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (userIds.isEmpty()) {
            return;
        }

        LambdaQueryWrapper<SysUser> userWrapper = new LambdaQueryWrapper<SysUser>()
                .in(SysUser::getUserId, userIds)
                .eq(SysUser::getStatus, "0")
                .eq(SysUser::getDeleted, 0)
                .orderByAsc(SysUser::getUserId);
        if (tenantId != null) {
            userWrapper.eq(SysUser::getTenantId, tenantId);
        }
        sysUserMapper.selectList(userWrapper).stream()
                .map(SysUser::getUserId)
                .filter(Objects::nonNull)
                .limit(Math.max(0, MAX_NOTIFICATION_RECIPIENTS - recipients.size()))
                .forEach(recipients::add);
    }

    private boolean isQueryableBusinessType(BusinessTypeDef def) {
        if (def == null || def.getCode() == null) {
            return false;
        }
        if (queryableBusinessTypeCache.contains(def.getCode())) {
            return true;
        }
        if (skippedBusinessTypeCache.contains(def.getCode())) {
            return false;
        }

        boolean queryable = hasRequiredColumns(def);
        if (queryable) {
            queryableBusinessTypeCache.add(def.getCode());
            return true;
        }
        skippedBusinessTypeCache.add(def.getCode());
        log.warn("[对账] 跳过未就绪业务类型: code={}, table={}, requiredColumns={}/{}/{}",
                def.getCode(), def.getBusinessTable(), def.getIdField(),
                def.getStatusField(), def.getProcessInstanceIdField());
        return false;
    }

    private boolean hasRequiredColumns(BusinessTypeDef def) {
        if (isBlank(def.getBusinessTable())
                || isBlank(def.getIdField())
                || isBlank(def.getStatusField())
                || isBlank(def.getProcessInstanceIdField())) {
            return false;
        }
        Integer count = jdbcTemplate.queryForObject("""
                    SELECT COUNT(DISTINCT COLUMN_NAME)
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = ?
                      AND COLUMN_NAME IN (?, ?, ?, 'tenant_id')
                    """,
                    Integer.class,
                    def.getBusinessTable(),
                    def.getIdField(),
                    def.getStatusField(),
                    def.getProcessInstanceIdField());
        return Objects.requireNonNullElse(count, 0) == 4;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
