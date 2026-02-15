package com.cloudflow.workflow.strategy;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;

import java.util.List;

/**
 * 人员分配策略接口
 * 借鉴 poco-flow 的策略模式设计，将原来 resolveAssignee() 中的 if-else 硬编码
 * 重构为可扩展的策略接口 + 多种实现
 *
 * 使用方式：
 *   Spring 会自动注入所有实现类，通过 AssignUserStrategyFactory 根据 approverType 获取对应策略
 *
 * 扩展方式：
 *   新增一个实现类，标注 @Component，实现 handle() 和 supports() 方法即可
 */
public interface AssignUserStrategy {

    /**
     * 解析单个审批人
     *
     * @param node     当前节点配置
     * @param instance 流程实例
     * @return 审批人用户ID，null 表示无法解析
     */
    Long resolve(WfNodeConfig node, WfProcessInstance instance);

    /**
     * 解析多个审批人（用于会签场景）
     *
     * @param node     当前节点配置
     * @param instance 流程实例
     * @return 审批人用户ID列表，空列表表示无法解析
     */
    List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance);

    /**
     * 是否支持该审批人类型
     *
     * @param approverType 审批人类型标识（如 USER、ROLE、DEPT_MANAGER 等）
     * @return true 表示支持
     */
    boolean supports(String approverType);

    /**
     * 获取审批人描述（用于前端展示）
     *
     * @param approverType  审批人类型
     * @param approverValue 审批人值
     * @return 可读描述，如 "张三"、"财务主管"、"部门经理"
     */
    String getDescription(String approverType, String approverValue);
}
