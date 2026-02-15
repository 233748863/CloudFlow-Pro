package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.domain.WfProcessCopy;

import java.util.List;
import java.util.Map;

/**
 * 流程抄送服务接口
 */
public interface IProcessCopyService {

    /**
     * 创建抄送记录
     * 在流程执行到 COPY 节点时调用，为每个抄送人创建一条记录
     *
     * @param instanceId    流程实例ID
     * @param processDefKey 流程定义Key
     * @param title         流程标题
     * @param nodeId        抄送节点ID
     * @param nodeName      抄送节点名称
     * @param startUserId   发起人ID
     * @param startUserName 发起人姓名
     * @param userIds       抄送接收人ID列表
     * @param formData      表单数据快照（JSON）
     */
    void createCopyRecords(String instanceId, String processDefKey, String title,
                           String nodeId, String nodeName,
                           Long startUserId, String startUserName,
                           List<Long> userIds, String formData);

    /**
     * 查询"抄送我的"列表（分页）
     *
     * @param userId    当前用户ID
     * @param pageQuery 分页参数（支持 keyword、isRead、processDefKey 筛选）
     * @return 分页结果
     */
    PageResult<WfProcessCopy> getMyCopyList(Long userId, PageQuery pageQuery);

    /**
     * 标记抄送记录为已读
     *
     * @param copyId 抄送记录ID
     * @param userId 当前用户ID
     */
    void markAsRead(Long copyId, Long userId);

    /**
     * 批量标记为已读
     *
     * @param copyIds 抄送记录ID列表
     * @param userId  当前用户ID
     */
    void batchMarkAsRead(List<Long> copyIds, Long userId);

    /**
     * 获取未读抄送数量
     *
     * @param userId 当前用户ID
     * @return 未读数量
     */
    int getUnreadCount(Long userId);
}
