package com.cloudflow.workflow.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
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

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        String taskId = body.get("taskId");

        log.info("Stream收到超时任务: {}, msgId: {}", taskId, msgId);

        try {
            // 执行业务逻辑 (自动通过)
            // 幂等性依赖 taskService 内部判断（如果任务非 pending 状态应抛错或忽略）
            taskService.completeTask(taskId, "PASS", "系统 SLA 自动通过 (Stream)", Collections.<String, Object>emptyMap(), null);

            // 手动确认
            redisStreamUtil.ack(workflowProperties.getStream().getKey(), workflowProperties.getStream().getGroup(), msgId);
            log.info("任务超时处理成功并ACK: {}", taskId);

        } catch (Exception e) {
            log.error("处理超时任务失败, msgId: " + msgId, e);
            // 不ACK, 留给重试机制 (Pending List)
        }
    }
}
