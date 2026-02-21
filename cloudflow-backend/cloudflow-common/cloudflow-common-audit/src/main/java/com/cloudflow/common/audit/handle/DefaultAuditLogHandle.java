package com.cloudflow.common.audit.handle;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import cn.hutool.extra.spring.SpringUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.javers.core.Changes;
import org.javers.core.diff.Change;
import org.javers.core.diff.changetype.ValueChange;
import org.springframework.scheduling.annotation.Async;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

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

    @Override
    public void handle(Audit audit, Changes changes) {
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

        // 将每个字段变更转换为审计日志记录
        List<SysAuditLogEntity> auditLogList = new ArrayList<>();
        for (Change change : changes) {
            if (!(change instanceof ValueChange valueChange)) {
                continue;
            }

            SysAuditLogEntity auditLog = new SysAuditLogEntity();
            auditLog.setAuditName(audit.name());
            auditLog.setAuditField(valueChange.getPropertyName());

            if (Objects.nonNull(valueChange.getLeft())) {
                auditLog.setBeforeVal(valueChange.getLeft().toString());
            }
            if (Objects.nonNull(valueChange.getRight())) {
                auditLog.setAfterVal(valueChange.getRight().toString());
            }

            auditLog.setCreateBy(username);
            auditLog.setCreateTime(LocalDateTime.now());
            auditLog.setTenantId(tenantId);

            auditLogList.add(auditLog);
        }

        if (!auditLogList.isEmpty()) {
            // 异步保存
            asyncSave(auditLogList);
        }
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
