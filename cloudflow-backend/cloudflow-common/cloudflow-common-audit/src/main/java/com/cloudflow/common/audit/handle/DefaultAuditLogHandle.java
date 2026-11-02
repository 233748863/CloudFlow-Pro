package com.cloudflow.common.audit.handle;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.audit.support.AuditBizModuleResolver;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import cn.hutool.extra.spring.SpringUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flipkart.zjsonpatch.JsonDiff;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.javers.core.Changes;
import org.javers.core.diff.Change;
import org.javers.core.diff.changetype.ValueChange;
import org.javers.core.diff.changetype.map.MapChange;
import org.javers.core.diff.changetype.map.EntryChange;
import org.javers.core.diff.changetype.map.EntryAdded;
import org.javers.core.diff.changetype.map.EntryRemoved;
import org.javers.core.diff.changetype.map.EntryValueChange;
import org.springframework.scheduling.annotation.Async;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 默认审计日志处理器
 * <p>
 * 将 Javers 变更列表转换为审计日志实体，通过本地 Mapper 异步入库。
 * 替代 poco 原版中通过 Feign 远程调用 UPMS 服务的方式。
 * </p>
 *
 * @author CloudFlow
 */
@Slf4j
@RequiredArgsConstructor
public class DefaultAuditLogHandle implements IAuditLogHandle {

    private final SysAuditLogMapper auditLogMapper;
    private final ObjectMapper objectMapper;
    private final AuditBizModuleResolver auditBizModuleResolver;

    @Override
    public void handle(Audit audit, Changes changes) {
        handle(audit, changes, null, null, null);
    }

    /**
     * M0-5 扩展：支持 diff=true 时记录完整 JSON。
     * @param oldVal 旧值对象（diff=true 时需要）
     * @param newVal 新值对象（diff=true 时需要）
     */
    public void handle(Audit audit, Changes changes, Object oldVal, Object newVal) {
        handle(audit, changes, oldVal, newVal, null);
    }

    @Override
    public void handle(Audit audit, Changes changes, Object oldVal, Object newVal, Class<?> sourceClass) {
        // 无变更则跳过
        if (changes.isEmpty()) {
            return;
        }

        // 获取当前操作人
        String username = UserContext.getUserName();
        if (username == null) {
            log.debug("审计日志跳过：无法获取当前操作用户");
            return;
        }

        // 获取租户ID，降级使用 TenantConfigProperties 中的默认值
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            try {
                TenantConfigProperties tenantConfig = SpringUtil.getBean(TenantConfigProperties.class);
                tenantId = tenantConfig.getDefaultTenantId();
            } catch (Exception e) {
                tenantId = 100000L;
            }
        }

        String bizModule = auditBizModuleResolver.resolve(sourceClass);

        // 将每个字段变更转换为审计日志记录
        List<SysAuditLogEntity> auditLogList = new ArrayList<>();
        for (Change change : changes) {
            if (change instanceof ValueChange valueChange) {
                auditLogList.add(fieldChange(valueChange.getPropertyName(), valueChange.getLeft(), valueChange.getRight()));
            } else if (change instanceof MapChange<?> mapChange) {
                for (EntryChange entry : mapChange.getEntryChanges()) {
                    String field = mapChange.getPropertyName() + "." + entry.getKey();
                    if (entry instanceof EntryValueChange value) {
                        auditLogList.add(fieldChange(field, value.getLeftValue(), value.getRightValue()));
                    } else if (entry instanceof EntryAdded added) {
                        auditLogList.add(fieldChange(field, null, added.getValue()));
                    } else if (entry instanceof EntryRemoved removed) {
                        auditLogList.add(fieldChange(field, removed.getValue(), null));
                    }
                }
            }
        }

        String beforeJson = null;
        String afterJson = null;
        String diffJson = null;
        if (audit.diff() && oldVal != null && newVal != null && !auditLogList.isEmpty()) {
            try {
                beforeJson = objectMapper.writeValueAsString(oldVal);
                afterJson = objectMapper.writeValueAsString(newVal);
                JsonNode diffNode = JsonDiff.asJson(objectMapper.readTree(beforeJson), objectMapper.readTree(afterJson));
                diffJson = diffNode.toString();
            } catch (Exception e) {
                log.warn("审计 JSON diff 失败: {}", e.getMessage());
            }
        }
        for (SysAuditLogEntity auditLog : auditLogList) {
            auditLog.setBizModule(bizModule);
            auditLog.setAuditName(audit.name());
            auditLog.setCreateBy(username);
            auditLog.setCreateTime(LocalDateTime.now());
            auditLog.setTenantId(tenantId);
            auditLog.setHighRisk(audit.highRisk() ? 1 : 0);
            auditLog.setRiskLevel(audit.highRisk() ? "HIGH" : "NORMAL");

            auditLog.setBeforeJson(beforeJson);
            auditLog.setAfterJson(afterJson);
            auditLog.setDiffJson(diffJson);
        }

        if (!auditLogList.isEmpty()) {
            // 异步保存
            asyncSave(auditLogList);
        }
    }

    private SysAuditLogEntity fieldChange(String name, Object before, Object after) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setAuditField(name);
        entry.setBeforeVal(before == null ? null : before.toString());
        entry.setAfterVal(after == null ? null : after.toString());
        return entry;
    }

    @Async
    @Override
    public void asyncSave(List<SysAuditLogEntity> auditLogList) {
        try {
            for (SysAuditLogEntity auditLog : auditLogList) {
                auditLogMapper.insert(auditLog);
            }
        } catch (Exception e) {
            log.error("审计日志入库失败: {}", e.getMessage(), e);
        }
    }
}
