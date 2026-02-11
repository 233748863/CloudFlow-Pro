package cn.joywon.poco.merchant.PlatformModule.listener;

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
public class PointsRuleExpiredListener implements MessageListener {

    private final IPointsRuleService pointsRuleService;

    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {

    }

}