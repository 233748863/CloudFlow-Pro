package com.cloudflow.workflow.strategy;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 人员分配策略工厂
 * 借鉴 poco-flow 的策略模式设计，通过 Spring 自动注入所有 AssignUserStrategy 实现类，
 * 根据 approverType 自动匹配对应的策略执行
 *
 * 使用示例：
 *   Long assigneeId = strategyFactory.resolve(node, instance);
 *   List<Long> assigneeIds = strategyFactory.resolveMultiple(node, instance);
 *   String desc = strategyFactory.getDescription("ROLE", "finance_manager");
 */
@Component
public class AssignUserStrategyFactory {

    private static final Logger log = LoggerFactory.getLogger(AssignUserStrategyFactory.class);

    /** Spring 自动注入所有 AssignUserStrategy 实现类 */
    @Autowired
    private List<AssignUserStrategy> strategies;

    /**
     * 根据节点配置的 approverType 查找匹配的策略
     *
     * @param approverType 审批人类型标识
     * @return 匹配的策略，未找到返回 null
     */
    public AssignUserStrategy getStrategy(String approverType) {
        if (approverType == null) {
            return null;
        }
        for (AssignUserStrategy strategy : strategies) {
            if (strategy.supports(approverType)) {
                return strategy;
            }
        }
        log.warn("[AssignUserStrategyFactory] 未找到匹配的人员分配策略: {}", approverType);
        return null;
    }

    /**
     * 解析单个审批人
     * 如果找不到匹配策略或解析失败，返回 null（由调用方决定回退逻辑）
     *
     * @param node     节点配置
     * @param instance 流程实例
     * @return 审批人用户ID，null 表示无法解析
     */
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        String approverType = node.getApproverType();
        AssignUserStrategy strategy = getStrategy(approverType);
        if (strategy == null) {
            log.warn("[AssignUserStrategyFactory] 无法解析审批人, approverType={}", approverType);
            return null;
        }
        try {
            return strategy.resolve(node, instance);
        } catch (Exception e) {
            log.error("[AssignUserStrategyFactory] 解析审批人异常, approverType={}, error={}", approverType, e.getMessage(), e);
            return null;
        }
    }

    /**
     * 解析多个审批人（用于会签场景）
     * 如果找不到匹配策略或解析失败，返回空列表
     *
     * @param node     节点配置
     * @param instance 流程实例
     * @return 审批人用户ID列表
     */
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        String approverType = node.getApproverType();
        AssignUserStrategy strategy = getStrategy(approverType);
        if (strategy == null) {
            log.warn("[AssignUserStrategyFactory] 无法解析多个审批人, approverType={}", approverType);
            return new ArrayList<>();
        }
        try {
            return strategy.resolveMultiple(node, instance);
        } catch (Exception e) {
            log.error("[AssignUserStrategyFactory] 解析多个审批人异常, approverType={}, error={}", approverType, e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    /**
     * 获取审批人描述（用于前端展示）
     *
     * @param approverType  审批人类型
     * @param approverValue 审批人值
     * @return 可读描述
     */
    public String getDescription(String approverType, String approverValue) {
        AssignUserStrategy strategy = getStrategy(approverType);
        if (strategy == null) {
            return "待定";
        }
        try {
            return strategy.getDescription(approverType, approverValue);
        } catch (Exception e) {
            log.warn("[AssignUserStrategyFactory] 获取描述失败: {}", e.getMessage());
            return "待定";
        }
    }
}
