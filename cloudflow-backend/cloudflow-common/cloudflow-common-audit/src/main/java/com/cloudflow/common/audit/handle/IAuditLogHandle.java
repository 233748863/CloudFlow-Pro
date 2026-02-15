package com.cloudflow.common.audit.handle;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import org.javers.core.Changes;

import java.util.List;

/**
 * 审计日志处理器接口
 * <p>
 * 定义审计日志的存储策略，支持自定义实现。
 * 默认实现通过本地 Mapper 入库。
 * </p>
 *
 * @author CloudFlow
 */
public interface IAuditLogHandle {

    /**
     * 处理审计变更（同步，由比较器调用）
     *
     * @param audit   审计注解信息
     * @param changes Javers 变更列表
     */
    void handle(Audit audit, Changes changes);

    /**
     * 异步批量保存审计日志
     *
     * @param auditLogList 审计日志列表
     */
    void asyncSave(List<SysAuditLogEntity> auditLogList);
}
