package com.cloudflow.workflow.listener;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;

import java.util.Map;

/**
 * 工作流全局监听器接口
 *
 * 参考 RuoYi-Cloud-Plus 的 GlobalListener 四阶段设计，
 * 在流程执行的关键节点提供回调扩展点。
 *
 * 四个阶段：
 *   1. create  — 流程实例创建后、第一个节点执行前
 *   2. start   — 节点开始执行前（每个节点都会触发）
 *   3. assignment — 任务分配给处理人后
 *   4. finish  — 节点执行完成后 / 流程结束时
 *
 * 使用方式：
 *   实现此接口并注册为 Spring Bean，引擎会自动发现并调用。
 *   支持多个监听器共存，按 {@link #getOrder()} 排序执行。
 *
 * 注意事项：
 *   - 监听器方法在主线程同步执行，请避免耗时操作
 *   - 如需异步处理，请在方法内部自行提交异步任务
 *   - 方法抛出异常会被引擎捕获并记录日志，不影响主流程
 */
public interface WorkflowGlobalListener {

    /**
     * 监听器执行顺序，数值越小越先执行
     * 默认值 0，多个监听器按此值升序排列
     */
    default int getOrder() {
        return 0;
    }

    /**
     * 阶段一：流程创建
     * 在流程实例创建完成、第一个节点执行之前调用。
     * 适用场景：初始化流程变量、注入默认配置、记录创建日志
     *
     * @param instance  新创建的流程实例
     * @param variables 流程变量（可修改，修改后会传递给后续节点）
     */
    default void onCreate(WfProcessInstance instance, Map<String, Object> variables) {
    }

    /**
     * 阶段二：节点开始
     * 在每个节点开始执行之前调用（包括审批、通知、脚本、网关等所有类型）。
     * 适用场景：节点级变量注入、条件预判断、执行前日志
     *
     * @param instance  流程实例
     * @param node      即将执行的节点配置
     * @param variables 当前流程变量（可修改）
     */
    default void onStart(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
    }

    /**
     * 阶段三：任务分配
     * 在审批任务创建并分配给处理人之后调用。
     * 仅审批节点（APPROVAL）和人工节点（MANUAL）会触发此回调。
     * 适用场景：发送自定义通知、记录分配日志、设置任务属性
     *
     * @param instance 流程实例
     * @param task     已创建的任务
     * @param node     任务所属的节点配置
     */
    default void onAssignment(WfProcessInstance instance, WfTask task, WfNodeConfig node) {
    }

    /**
     * 阶段四：节点完成 / 流程结束
     * 在节点执行完成后调用。当节点类型为 END 时，表示整个流程结束。
     * 适用场景：节点后置处理、抄送通知、状态同步、流程完成回调
     *
     * @param instance  流程实例
     * @param node      已完成的节点配置（END 节点表示流程结束）
     * @param variables 当前流程变量
     */
    default void onFinish(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
    }
}
