package com.cloudflow.workflow.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.IWfTaskService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.stream.StreamListener;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.Map;

@Component
public class WorkflowStreamConsumer implements StreamListener<String, MapRecord<String, String, String>> {

    private static final Logger log = LoggerFactory.getLogger(WorkflowStreamConsumer.class);

    @Autowired
    private IWfTaskService taskService;

    @Autowired
    private RedisStreamUtil redisStreamUtil;

    @Autowired
    private WorkflowProperties workflowProperties;

    @Autowired
    private WfTaskMapper taskMapper;

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        String taskId = body.get("taskId");

        log.info("Stream收到超时任务: {}, msgId: {}", taskId, msgId);

        try {
            // Stream 消费线程无 HTTP/Sa-Token 上下文：先跨租户读 task 拿 tenantId，
            // 再用 TenantBroker.runAs 包裹 completeTask，确保后续 SQL 走对租户。
            Long tenantId = TenantBroker.applyWithoutTenant(v -> {
                WfTask task = taskMapper.selectById(taskId);
                return task != null ? task.getTenantId() : null;
            });
            if (tenantId == null) {
                log.warn("Stream 超时任务对应 task 不存在或缺 tenantId, taskId={}, msgId={}", taskId, msgId);
            }
            TenantBroker.runAs(tenantId, tid -> {
                taskService.completeTask(taskId, "PASS", "系统 SLA 自动通过 (Stream)",
                        Collections.<String, Object>emptyMap(), null);
            });

            // 手动确认
            redisStreamUtil.ack(workflowProperties.getStream().getKey(), workflowProperties.getStream().getGroup(), msgId);
            log.info("任务超时处理成功并ACK: {}", taskId);

        } catch (Exception e) {
            log.error("处理超时任务失败, msgId: " + msgId, e);
            // 不ACK, 留给重试机制 (Pending List)
        }
    }
}
