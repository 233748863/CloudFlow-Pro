package com.cloudflow.common.workflow.callback.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 业务服务通过 yaml 配置工作流回调通道。
 *
 * <pre>
 * cloudflow:
 *   workflow:
 *     callback:
 *       enabled: true
 *       stream-key: workflow:stream:approval-callback:oa
 *       group: group:oa:workflow-callback
 *       consumer-prefix: oa-callback
 * </pre>
 */
@Data
@ConfigurationProperties(prefix = "cloudflow.workflow.callback")
public class WorkflowCallbackProperties {

    /** 是否启用本服务的回调消费骨架；默认开启。 */
    private boolean enabled = true;

    /** 当前服务消费的 Stream Key（必须与 workflow 写入端约定的 callbackStreamKey 一致）。 */
    private String streamKey;

    /** 当前服务的消费组名。 */
    private String group;

    /** 消费者名称前缀，最终拼接随机后缀。 */
    private String consumerPrefix = "callback";

    /** 幂等键 TTL（小时），防止重复消费。 */
    private int idempotentTtlHours = 72;

    /** 消费失败最大重试次数，超过后转 DLQ。 */
    private int maxRetry = 5;
}
