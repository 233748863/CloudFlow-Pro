package com.cloudflow.workflow.handler;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;

import java.util.Map;

/**
 * 节点处理器接口
 * 每种节点类型（NOTIFICATION/SCRIPT/TIMER/SUBPROCESS/MANUAL/COPY）对应一个实现
 * 从 WorkflowServiceImpl 拆分出来，遵循策略模式
 *
 * @author CloudFlow
 */
public interface INodeHandler {

    /**
     * 获取此处理器支持的节点类型
     * 例如: "NOTIFICATION", "SCRIPT", "TIMER", "SUBPROCESS", "MANUAL", "COPY"
     *
     * @return 节点类型字符串
     */
    String getNodeType();

    /**
     * 处理节点
     *
     * @param node      节点配置
     * @param instance  流程实例
     * @param variables 流程变量
     * @return 处理结果：true=自动继续流转，false=等待（如定时节点、人工任务）
     */
    boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables);
}
