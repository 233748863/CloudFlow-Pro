package cn.joywon.poco.merchant.PlatformModule.listener;

import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleCacheKey;
import cn.joywon.poco.merchant.PlatformModule.service.IPointsRuleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PointsRuleActivateListener implements MessageListener, PointsRuleCacheKey {

    private final IPointsRuleService pointsRuleService;

    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {
        String body = new String(message.getBody());
        try {
            if (body.startsWith(KEY_PREFIX_PENDING_ACTIVATE)) {
                String pointsRuleId = body.substring(KEY_PREFIX_PENDING_ACTIVATE.length());
                pointsRuleService.activatePointsRule(pointsRuleId);
            }
        } catch (Exception e) {
            log.error("积分规则激活消息处理失败, 消息体: {}", body, e);
        }
    }

}