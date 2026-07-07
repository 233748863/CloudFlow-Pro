package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;

import java.util.List;
import java.util.Map;

/**
 * 节点执行引擎服务接口
 * 负责流程节点的递归执行、条件评估、人员分配等核心引擎逻辑
 * 
 * 从原工作流服务拆分而来，参考 RuoYi-Cloud-Plus 职责分离设计
 *
 * @author CloudFlow
 */
public interface INodeExecutionService {

    /**
     * 流程变量中记录"执行失败导致挂起"的节点Key的系统变量名。
     * 主干自动节点（脚本/子流程等）重试耗尽后流程挂起，恢复流程时从该节点重跑。
     */
    String FAILED_NODE_KEY_VARIABLE = "_failedNodeKey";

    /**
     * 递归执行流程节点
     * 根据节点类型分发到不同的处理逻辑（审批/通知/脚本/定时/子流程/人工/抄送等）
     *
     * @param instance  流程实例
     * @param node      当前要执行的节点
     * @param variables 流程变量
     * @param depth     递归深度（防止栈溢出）
     * @param rootNode  流程定义根节点（避免重复查询数据库）
     */
    void runNode(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables, int depth, WfNodeConfig rootNode);

    /**
     * 节点完成后的流转逻辑（nodes+edges 图模型）。
     * 优先处理当前节点的出边分支，再处理默认出边。
     *
     * @param instance       流程实例
     * @param currentNode    当前完成的节点
     * @param currentNodeKey 当前节点Key
     * @param variables      流程变量
     * @param depth          递归深度
     * @param rootNode       流程定义入口节点（附带运行时图索引）
     */
    void advanceAfterNode(WfProcessInstance instance, WfNodeConfig currentNode, String currentNodeKey,
                          Map<String, Object> variables, int depth, WfNodeConfig rootNode);

    /**
     * 完成流程实例（设置状态和结束时间）
     *
     * @param instance 流程实例
     * @param status   目标状态（COMPLETED/REJECTED 等）
     */
    void completeInstance(WfProcessInstance instance, String status);

    /**
     * 因节点执行失败挂起流程实例：状态置 SUSPENDED，失败节点写入
     * {@link #FAILED_NODE_KEY_VARIABLE} 流程变量并通知发起人；
     * 恢复流程（resumeProcess）时从该节点重跑。
     *
     * @param instance  流程实例
     * @param nodeKey   失败节点Key
     * @param nodeTitle 失败节点标题（用于通知文案）
     * @param reason    失败原因（用于日志与通知）
     */
    void suspendInstanceForNodeFailure(WfProcessInstance instance, String nodeKey, String nodeTitle, String reason);

    /**
     * 在运行时图索引中查找指定 ID 的节点。
     *
     * @param root   流程定义入口节点（附带运行时图索引）
     * @param nodeId 目标节点ID
     * @return 找到的节点，未找到返回 null
     */
    WfNodeConfig findNode(WfNodeConfig root, String nodeId);

    /**
     * 查找当前节点完成后要执行的下一个默认出边节点（图模型）。
     *
     * @param root          流程定义入口节点（附带运行时图索引）
     * @param currentNodeId 当前节点ID
     * @return 下一个节点，未找到返回 null
     */
    WfNodeConfig findNextNode(WfNodeConfig root, String currentNodeId);

    /**
     * 评估条件表达式
     * 支持结构化 JSON 条件和 SpEL 表达式两种格式
     *
     * @param condition 条件表达式
     * @param variables 流程变量
     * @return 条件是否满足
     */
    boolean evaluateCondition(String condition, Map<String, Object> variables);

    /**
     * 解析单个审批人（使用策略工厂）
     *
     * @param node     节点配置
     * @param instance 流程实例
     * @return 审批人用户ID
     */
    Long resolveAssignee(WfNodeConfig node, WfProcessInstance instance);

    /**
     * 解析多个审批人（用于会签场景）
     *
     * @param node     节点配置
     * @param instance 流程实例
     * @return 审批人用户ID列表
     */
    List<Long> resolveMultipleAssignees(WfNodeConfig node, WfProcessInstance instance);

    /**
     * 从流程定义图中提取主线审批步骤列表。
     *
     * @param root 流程定义入口节点（附带运行时图索引）
     * @return 步骤列表 [{nodeKey, nodeTitle, approverType, ...}]
     */
    List<Map<String, String>> extractApprovalSteps(WfNodeConfig root);

    /**
     * 批量构建所有步骤的详情列表（含审批人信息、状态等）
     *
     * @param steps          步骤列表
     * @param histories      历史记录
     * @param currentNodeKey 当前活动节点Key
     * @return 步骤详情列表
     */
    List<Map<String, Object>> buildAllStepsDetail(List<Map<String, String>> steps,
                                                   List<com.cloudflow.workflow.domain.WfTaskHistory> histories,
                                                   String currentNodeKey);

    /**
     * 从节点配置中提取按钮权限列表
     *
     * @param node 流程节点配置
     * @return 按钮权限列表，null 表示未配置（显示全部默认按钮）
     */
    List<String> extractNodeButtons(WfNodeConfig node);

    /**
     * 根据审批人配置解析出可读的处理人描述
     *
     * @param approverType  审批人类型
     * @param approverValue 审批人值
     * @return 可读描述，如 "财务主管"
     */
    String resolveAssigneeDescription(String approverType, String approverValue);

    /**
     * 保存流程实例快照
     *
     * @param instance 流程实例
     * @param nodeKey  节点Key
     * @param nodeName 节点名称
     */
    void saveProcessSnapshot(WfProcessInstance instance, String nodeKey, String nodeName);
}
