package com.cloudflow.workflow.handler;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 节点处理器工厂
 * 通过 Spring 自动收集所有 INodeHandler 实现，按节点类型分发
 * 新增节点类型只需实现 INodeHandler 接口并注册为 Spring Bean 即可
 *
 * @author CloudFlow
 */
@Component
public class NodeHandlerFactory {

    private static final Logger log = LoggerFactory.getLogger(NodeHandlerFactory.class);

    /** 节点类型 -> 处理器映射 */
    private final Map<String, INodeHandler> handlerMap = new HashMap<>();

    /**
     * 构造函数：Spring 自动注入所有 INodeHandler 实现
     *
     * @param handlers 所有节点处理器列表
     */
    public NodeHandlerFactory(List<INodeHandler> handlers) {
        for (INodeHandler handler : handlers) {
            String nodeType = handler.getNodeType();
            handlerMap.put(nodeType, handler);
            log.info("[NodeHandlerFactory] 注册节点处理器: {} -> {}", nodeType, handler.getClass().getSimpleName());
        }
        log.info("[NodeHandlerFactory] 共注册 {} 个节点处理器", handlerMap.size());
    }

    /**
     * 获取指定节点类型的处理器
     *
     * @param nodeType 节点类型
     * @return 处理器实例，不存在返回 null
     */
    public INodeHandler getHandler(String nodeType) {
        return handlerMap.get(nodeType);
    }

    /**
     * 判断是否支持指定节点类型
     *
     * @param nodeType 节点类型
     * @return true=支持
     */
    public boolean supports(String nodeType) {
        return handlerMap.containsKey(nodeType);
    }

    /**
     * 执行节点处理
     * 如果找到对应处理器则委托执行，否则返回 null 表示未处理
     *
     * @param node      节点配置
     * @param instance  流程实例
     * @param variables 流程变量
     * @return true=自动继续流转，false=等待，null=无对应处理器
     */
    public Boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        if (node == null || node.getType() == null) {
            return null;
        }
        INodeHandler handler = handlerMap.get(node.getType());
        if (handler == null) {
            return null;
        }
        log.info("[NodeHandlerFactory] 分发节点处理: type={}, nodeKey={}, handler={}",
                node.getType(), node.getId(), handler.getClass().getSimpleName());
        return handler.handle(node, instance, variables);
    }
}
