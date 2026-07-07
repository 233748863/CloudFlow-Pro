package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.vo.DynamicMapVO;

import java.util.Map;

/**
 * 流程实例管理服务接口
 * 负责流程的启动、撤回、暂停、恢复、查询等操作
 * 
 * 从原工作流服务拆分而来，参考 RuoYi-Cloud-Plus IFlwInstanceService 设计
 *
 * @author CloudFlow
 */
public interface IWfInstanceService {

    /**
     * 发起流程
     *
     * @param processDefKey 流程定义Key
     * @param businessKey   业务主键
     * @param variables     流程变量
     * @return 结果（包含实例ID）
     */
    R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables);

    R<?> startProcessInternal(String processDefKey, String businessKey, Long startUserId,
                              String startUserName, Map<String, Object> variables);

    /**
     * 撤回流程
     *
     * @param instanceId 实例ID
     * @return 结果
     */
    R<?> recallProcess(String instanceId);

    /**
     * 暂停流程
     *
     * @param instanceId 实例ID
     * @return 结果
     */
    R<?> pauseProcess(String instanceId);

    /**
     * 恢复流程
     *
     * @param instanceId 实例ID
     * @return 结果
     */
    R<?> resumeProcess(String instanceId);

    /**
     * 查询实例详情
     *
     * @param instanceId 实例ID
     * @return 实例信息
     */
    WfProcessInstance getProcessInstance(String instanceId);

    /**
     * 获取流程追踪信息
     *
     * @param instanceId 实例ID
     * @return 追踪信息 { finished, active, historyDetails, activeDetails, parallelBranches }
     */
    DynamicMapVO getProcessTrace(String instanceId);

    /**
     * 查询我的发起（分页）
     *
     * @param userId    用户ID
     * @param pageQuery 分页参数
     * @return 实例列表
     */
    PageResult<WfProcessInstance> getMyInstances(Long userId, PageQuery pageQuery);

    /**
     * 定时节点到期后继续流转
     *
     * @param instanceId 流程实例ID
     * @param nodeKey    定时节点Key
     * @param variables  定时任务中保存的流程变量
     */
    void continueFromTimerNode(String instanceId, String nodeKey, Map<String, Object> variables);

    /**
     * 处理子流程结束（在实例锁 + 事务保护下执行，按 childInstanceId 幂等）：
     * - 子流程 COMPLETED → 父流程从子流程节点的 next 继续流转
     * - 其余终态（驳回/撤回/作废/终止）→ 父流程挂起（SUSPENDED）+ 通知，人工处理后可恢复重跑子流程节点
     * 父流程定义严格按实例锁定的 definitionId 解析，缺失时挂起父流程而非回退最新版本。
     *
     * @param parentInstanceId 父流程实例ID
     * @param parentNodeKey    父流程中触发子流程的节点Key
     * @param childInstanceId  子流程实例ID
     * @param childStatus      子流程终态（WfProcessStatus code）
     */
    void handleSubprocessFinished(String parentInstanceId, String parentNodeKey, String childInstanceId, String childStatus);

    /**
     * P1-6: 获取流程图渲染数据
     * 返回节点列表（含坐标、运行时状态）和连线列表，供前端流程图组件渲染
     *
     * @param instanceId 流程实例ID
     * @return 流程图数据 { nodes: [...], edges: [...] }
     */
    DynamicMapVO getFlowchartData(String instanceId);

    /**
     * P1-7: 作废流程实例
     * 管理员可作废任何运行中的流程，作废后流程终止且不可恢复
     * 作废操作会：删除所有待办任务、更新实例状态为INVALIDATED、记录审计日志
     *
     * @param instanceId 流程实例ID
     * @param reason     作废原因（必填）
     * @return 结果
     */
    R<?> invalidateProcess(String instanceId, String reason);

    /**
     * P1-3: 终止流程实例
     * 管理员强制终止异常流程，与作废的区别是用于异常流程处理
     * 终止操作会：删除所有待办任务、更新实例状态为TERMINATED、记录审计日志
     *
     * @param instanceId 流程实例ID
     * @param reason     终止原因（必填）
     * @return 结果
     */
    R<?> terminateProcess(String instanceId, String reason);
}
