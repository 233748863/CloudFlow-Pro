package com.cloudflow.workflow.processor;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Map;

/**
 * 审批后置处理器
 * 借鉴 poco-flow 的 ApproveServiceTask 设计，将审批完成后的后置逻辑
 * （如拒绝跳转、条件路由、通知等）从 completeTask 中解耦出来
 *
 * poco-flow 的做法：在审批 UserTask 后接一个 ServiceTask（ApproveServiceTask），
 * 由 ServiceTask 负责处理拒绝时的跳转逻辑（跳转到指定节点或直接结束）
 *
 * 本项目的适配：不依赖 Flowable 的 ServiceTask 机制，而是在审批完成后
 * 通过 ApprovalPostProcessor 统一处理后置逻辑，实现同样的解耦效果
 */
@Component
public class ApprovalPostProcessor {

    private static final Logger log = LoggerFactory.getLogger(ApprovalPostProcessor.class);

    /**
     * 审批后置处理结果
     */
    public static class PostProcessResult {

        /** 处理动作类型 */
        private Action action;

        /** 目标节点Key（用于 JUMP_TO_NODE） */
        private String targetNodeKey;

        /** 附加信息 */
        private String message;

        public enum Action {
            /** 继续流转到下一个节点（默认行为） */
            CONTINUE,
            /** 跳转到指定节点（如驳回到发起人） */
            JUMP_TO_NODE,
            /** 直接结束流程 */
            END_PROCESS,
            /** 暂停流程（等待外部事件） */
            SUSPEND
        }

        public static PostProcessResult continueFlow() {
            PostProcessResult r = new PostProcessResult();
            r.action = Action.CONTINUE;
            return r;
        }

        public static PostProcessResult jumpToNode(String nodeKey) {
            PostProcessResult r = new PostProcessResult();
            r.action = Action.JUMP_TO_NODE;
            r.targetNodeKey = nodeKey;
            return r;
        }

        public static PostProcessResult endProcess(String message) {
            PostProcessResult r = new PostProcessResult();
            r.action = Action.END_PROCESS;
            r.message = message;
            return r;
        }

        public Action getAction() { return action; }
        public String getTargetNodeKey() { return targetNodeKey; }
        public String getMessage() { return message; }
    }

    /**
     * 统一后置处理入口
     * 根据审批动作（APPROVE/REJECT）分发到对应的处理方法
     *
     * @param node      当前审批节点配置
     * @param instance  流程实例
     * @param action    审批动作（APPROVE / REJECT）
     * @param variables 流程变量
     */
    public void process(WfNodeConfig node, WfProcessInstance instance,
                        String action, Map<String, Object> variables) {
        if (node == null || instance == null) {
            return;
        }
        log.info("[ApprovalPostProcessor] 执行后置处理, nodeKey={}, action={}", node.getId(), action);

        try {
            if ("APPROVE".equalsIgnoreCase(action)) {
                processApproval(node, instance, variables);
            } else if ("REJECT".equalsIgnoreCase(action)) {
                processRejection(node, instance, variables);
            }
            // 其他动作（如 DELEGATE）暂不做后置处理
        } catch (Exception e) {
            // 后置处理失败不影响主流程
            log.warn("[ApprovalPostProcessor] 后置处理异常, nodeKey={}: {}", node.getId(), e.getMessage());
        }
    }

    /**
     * 处理审批通过后的后置逻辑
     * 借鉴 poco-flow ApproveServiceTask 中 approve=true 的分支
     *
     * @param node      当前审批节点配置
     * @param instance  流程实例
     * @param variables 流程变量
     * @return 后置处理结果
     */
    public PostProcessResult processApproval(WfNodeConfig node, WfProcessInstance instance,
                                              Map<String, Object> variables) {
        log.info("[ApprovalPostProcessor] 处理审批通过, nodeKey={}, instanceId={}",
                node.getId(), instance.getInstanceId());

        // 检查节点是否配置了审批通过后的特殊行为
        Map<String, Object> props = node.getProps();
        if (props != null) {
            String onApproveAction = (String) props.get("onApproveAction");
            if ("JUMP_TO_NODE".equals(onApproveAction)) {
                String targetNode = (String) props.get("onApproveTarget");
                if (StringUtils.hasText(targetNode)) {
                    log.info("[ApprovalPostProcessor] 审批通过后跳转到节点: {}", targetNode);
                    return PostProcessResult.jumpToNode(targetNode);
                }
            }
        }

        // 默认行为：继续流转
        return PostProcessResult.continueFlow();
    }

    /**
     * 处理审批拒绝后的后置逻辑
     * 借鉴 poco-flow ApproveServiceTask 中 approve=false 的分支：
     *   - TO_NODE: 跳转到指定节点（如驳回到发起人重新填写）
     *   - TO_END:  直接结束流程
     *   - TO_PREV: 驳回到上一个审批节点
     *
     * @param node      当前审批节点配置
     * @param instance  流程实例
     * @param variables 流程变量
     * @return 后置处理结果
     */
    public PostProcessResult processRejection(WfNodeConfig node, WfProcessInstance instance,
                                               Map<String, Object> variables) {
        log.info("[ApprovalPostProcessor] 处理审批拒绝, nodeKey={}, instanceId={}",
                node.getId(), instance.getInstanceId());

        // 从节点配置中获取拒绝处理策略
        // 借鉴 poco-flow 的 Refuse 对象设计
        Map<String, Object> props = node.getProps();
        if (props != null) {
            String rejectHandler = (String) props.get("rejectHandler");

            if ("TO_NODE".equals(rejectHandler)) {
                // 跳转到指定节点（如驳回到发起人）
                String targetNodeKey = (String) props.get("rejectTargetNode");
                if (StringUtils.hasText(targetNodeKey)) {
                    log.info("[ApprovalPostProcessor] 拒绝后跳转到节点: {}", targetNodeKey);
                    return PostProcessResult.jumpToNode(targetNodeKey);
                }
            }

            if ("TO_PREV".equals(rejectHandler)) {
                // 驳回到上一个审批节点
                // 需要从历史记录中查找上一个审批节点的 nodeKey
                String prevNodeKey = (String) props.get("rejectTargetNode");
                if (StringUtils.hasText(prevNodeKey)) {
                    log.info("[ApprovalPostProcessor] 拒绝后驳回到上一节点: {}", prevNodeKey);
                    return PostProcessResult.jumpToNode(prevNodeKey);
                }
            }
        }

        // 默认行为：直接结束流程（与 poco-flow 的默认行为一致）
        log.info("[ApprovalPostProcessor] 拒绝后结束流程");
        return PostProcessResult.endProcess("审批被拒绝");
    }

    /**
     * 处理审批人为空时的后置逻辑
     * 借鉴 poco-flow 的 ApprovalCreateListener 中 nobody 处理逻辑：
     *   - TO_PASS:  直接通过（自动审批）
     *   - TO_ADMIN: 指派给管理员
     *   - TO_USER:  指派给指定用户
     *   - TO_REFUSE: 直接拒绝（结束流程）
     *
     * @param node     当前审批节点配置
     * @param instance 流程实例
     * @return 后置处理结果
     */
    public PostProcessResult processNobody(WfNodeConfig node, WfProcessInstance instance) {
        log.info("[ApprovalPostProcessor] 处理审批人为空, nodeKey={}, instanceId={}",
                node.getId(), instance.getInstanceId());

        Map<String, Object> props = node.getProps();
        if (props != null) {
            String nobodyHandler = (String) props.get("nobodyHandler");

            if ("TO_PASS".equals(nobodyHandler)) {
                // 直接通过，继续流转
                log.info("[ApprovalPostProcessor] 审批人为空，自动通过");
                return PostProcessResult.continueFlow();
            }

            if ("TO_REFUSE".equals(nobodyHandler)) {
                // 直接拒绝
                log.info("[ApprovalPostProcessor] 审批人为空，自动拒绝");
                return PostProcessResult.endProcess("审批人为空，流程自动终止");
            }

            // TO_ADMIN 和 TO_USER 的情况由调用方处理（需要重新分配审批人）
            // 这里返回 null 表示需要调用方进一步处理
        }

        // 默认：回退到管理员
        return null;
    }

    /**
     * 判断节点是否配置了拒绝跳转（而非直接结束）
     *
     * @param node 节点配置
     * @return true 表示配置了跳转目标
     */
    public boolean hasRejectJumpTarget(WfNodeConfig node) {
        Map<String, Object> props = node.getProps();
        if (props == null) return false;

        String rejectHandler = (String) props.get("rejectHandler");
        return "TO_NODE".equals(rejectHandler) || "TO_PREV".equals(rejectHandler);
    }

    /**
     * 获取拒绝跳转的目标节点Key
     *
     * @param node 节点配置
     * @return 目标节点Key，null 表示未配置
     */
    public String getRejectTargetNodeKey(WfNodeConfig node) {
        Map<String, Object> props = node.getProps();
        if (props == null) return null;
        return (String) props.get("rejectTargetNode");
    }
}
