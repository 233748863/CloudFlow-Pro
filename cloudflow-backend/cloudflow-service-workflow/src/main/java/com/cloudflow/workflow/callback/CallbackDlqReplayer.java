package com.cloudflow.workflow.callback;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.workflow.domain.WfCallbackDeadLetter;
import com.cloudflow.workflow.mapper.WfCallbackDeadLetterMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class CallbackDlqReplayer {

    private final WfCallbackDeadLetterMapper deadLetterMapper;
    private final ObjectMapper objectMapper;
    private final RedisStreamUtil redisStreamUtil;

    public void replay(WfCallbackDeadLetter dlq) {
        try {
            Map<String, String> payload = objectMapper.readValue(
                    dlq.getPayloadJson(), new TypeReference<Map<String, String>>() {});
            Map<String, Object> body = new HashMap<>(payload);
            redisStreamUtil.publishGlobal(dlq.getStreamKey(), body);
            dlq.setStatus("REPLAYED");
            dlq.setUpdateTime(LocalDateTime.now());
            deadLetterMapper.updateById(dlq);
        } catch (Exception e) {
            log.error("重投死信消息失败: id={}", dlq.getId(), e);
            throw new RuntimeException("重投失败: " + e.getMessage(), e);
        }
    }
}
