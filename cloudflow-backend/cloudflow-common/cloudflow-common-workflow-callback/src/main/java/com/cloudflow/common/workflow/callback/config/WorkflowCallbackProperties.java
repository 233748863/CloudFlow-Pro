package com.cloudflow.common.workflow.callback.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.Assert;

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

    private long pendingMinIdleSeconds = 60;
    private long pendingPollIntervalSeconds = 10;
    private int pendingBatchSize = 100;
    private long processingLeaseSeconds = 30;

    public void validate() {
        Assert.hasText(streamKey, "cloudflow.workflow.callback.stream-key 不能为空");
        Assert.hasText(group, "cloudflow.workflow.callback.group 不能为空");
        Assert.hasText(consumerPrefix, "回调消费者前缀不能为空");
        Assert.isTrue(idempotentTtlHours > 0, "完成标记保留时间必须为正数");
        Assert.isTrue(maxRetry > 0, "回调重试次数必须为正数");
        Assert.isTrue(pendingMinIdleSeconds >= 60, "待处理回调重领空闲时间至少为60秒");
        Assert.isTrue(pendingPollIntervalSeconds >= 1, "待处理回调扫描间隔至少为1秒");
        Assert.isTrue(pendingBatchSize >= 1 && pendingBatchSize <= 100, "待处理回调单批数量必须为1至100");
        Assert.isTrue(processingLeaseSeconds >= 5 && processingLeaseSeconds <= 60, "回调处理租约必须为5至60秒");
    }
}
