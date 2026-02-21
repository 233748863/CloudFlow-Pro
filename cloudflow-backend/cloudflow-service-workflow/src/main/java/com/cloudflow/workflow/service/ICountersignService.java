package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfCountersignTask;
import com.cloudflow.workflow.domain.WfTask;

import java.util.List;
import java.util.Map;

/**
 * 会签服务接口
 * 支持 ALL（全部通过）、ANY（任一通过）、PERCENT（按比例通过）三种模式
 */
public interface ICountersignService {

    /** 创建会签任务 */
    String createCountersignTask(String instanceId, String nodeKey, String nodeName,
                                  String signType, Integer passPercent, List<Long> assigneeIds);

    /** 会签投票（核心并发控制方法） */
    String vote(String taskId, Long voterId, String voterName, String voteResult, String comment);

    /** 查询会签进度 */
    Map<String, Object> getCountersignProgress(String countersignId);

    /** 判断任务是否为会签任务 */
    boolean isCountersignTask(WfTask task);

    /** 从任务中提取会签ID */
    String extractCountersignId(WfTask task);

    /** 查询指定实例和节点的会签任务 */
    WfCountersignTask getCountersignByNode(String instanceId, String nodeKey);

    /** 获取会签任务信息 */
    WfCountersignTask getCountersignTask(String instanceId, String nodeKey);

    /** 更新会签任务 */
    void updateCountersignTask(WfCountersignTask csTask);

    /** 检查用户是否已投票 */
    boolean hasUserVoted(String countersignId, Long userId);

    /** 检查并完成会签（减签后可能满足通过条件） */
    void checkAndCompleteCountersign(WfCountersignTask csTask);
}
