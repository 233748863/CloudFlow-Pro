package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.R;

import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * P4 高价值功能服务接口
 * 包含审批流程增强、任务管理增强、流程管理增强、通知与催办
 */
public interface IWorkflowP4Service {

    // ==================== 审批流程增强 ====================

    /** P4.1: 任务委托/转办 */
    R<?> delegateTask(String taskId, Long toUserId, String toUserName, String reason);

    /** P4.2: 加签（BEFORE/AFTER/PARALLEL） */
    R<?> addSign(String taskId, List<Long> userIds, List<String> userNames, String signType, String reason);

    /** P4.5: 设置审批代理 */
    R<?> setProxy(Long userId, String userName, Long proxyUserId, String proxyUserName,
                  Date startTime, Date endTime, String reason);

    /** P4.5: 取消审批代理 */
    R<?> cancelProxy(Long userId);

    /** P4.6: 创建候选人任务 */
    void createCandidateTask(String taskId, String instanceId, List<Long> userIds,
                             List<String> userNames, String type);

    /** P4.6: 认领候选任务 */
    R<?> claimTask(String taskId, Long userId, String userName);

    /** P4.7: 撤回已审批的任务 */
    R<?> withdrawApproval(String historyId, Long operatorId);

    /** P4.8: 驳回到上一步 */
    R<?> rejectToPrevious(String taskId, Long operatorId, String operatorName, String comment);

    /** P4.9: 上传任务附件 */
    R<?> uploadAttachment(String taskId, String instanceId, String fileName, String fileUrl,
                          String fileType, Long fileSize, Long uploaderId, String uploaderName);

    /** P4.9: 查询任务附件列表 */
    R<?> getTaskAttachments(String taskId);

    /** P4.9: 删除附件 */
    R<?> deleteAttachment(String attachmentId, Long operatorId);

    /** P4.10: 批量审批 */
    R<?> batchApprove(List<String> taskIds, Long operatorId, String operatorName, String action, String comment);

    // ==================== 任务管理增强 ====================

    /** P4.11: 设置任务优先级 */
    R<?> setTaskPriority(String taskId, String priority);

    /** P4.12: 查询代理人的待办任务 */
    R<?> getProxyTasks(Long userId, PageQuery pageQuery);

    /** P4.13: 标记超时任务 */
    int markTimeoutTasks(int timeoutHours);

    /** P4.14/P4.15: 任务高级查询（筛选+排序） */
    R<?> advancedTaskQuery(Long userId, Map<String, Object> filters, PageQuery pageQuery);

    /** P4.16: 已办任务查询 */
    R<?> getDoneTasks(Long userId, PageQuery pageQuery);

    /** P4.17/P4.18: 批量标记已读（含权限校验） */
    R<?> batchMarkRead(List<String> taskIds, Long userId);

    // ==================== 流程管理增强 ====================

    /** P4.19: 版本比对 */
    R<?> compareVersions(String defId1, String defId2);

    /** P4.20: 导出流程定义 */
    R<?> exportDefinition(String defId);

    /** P4.20: 导入流程定义 */
    R<?> importDefinition(Map<String, Object> importData);

    /** P4.21: 查询表单历史版本 */
    R<?> getFormVersions(String formKey);

    /** P4.21: 回退表单版本 */
    R<?> rollbackFormVersion(String formKey, Integer targetVersion);

    /** P4.22: 记录发布 */
    void recordDeploy(String definitionId, String processKey, Integer version,
                      Long deployerId, String deployerName, String deployNote, String changeLog);

    /** P4.23: 表单使用统计 */
    R<?> getFormUsage(String formKey);

    /** P4.24: 设置流程实例优先级 */
    R<?> setInstancePriority(String instanceId, String priority);

    // ==================== 通知与催办 ====================

    /** P4.25: 发布通知 */
    void notifyProcessPublished(String definitionId);

    /** P4.26: 催办记录查询 */
    R<?> getUrgeRecords(String taskId);

    /** P4.27: 催办效果跟踪 */
    void recordUrgeEffect(String urgeId, String taskId, Long beforeDuration, Long afterDuration);

    /** P4.28: 发送通知 */
    void sendNotification(String eventType, Long recipientId, String title, String content);
}
