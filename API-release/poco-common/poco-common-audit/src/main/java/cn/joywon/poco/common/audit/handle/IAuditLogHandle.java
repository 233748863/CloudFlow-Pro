package cn.joywon.poco.common.audit.handle;

import cn.joywon.poco.admin.api.entity.SysAuditLog;
import cn.joywon.poco.common.audit.annotation.Audit;
import org.javers.core.Changes;

import java.util.List;

/**
 * @author poco
 * @date 2023/2/26
 *
 * 审计日志处理器
 */
public interface IAuditLogHandle {

	void handle(Audit audit, Changes changes);

	void asyncSend(List<SysAuditLog> auditLogList);

}
