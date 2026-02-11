package cn.joywon.poco.merchant.PointsModule.message.listener;

import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.PointsModule.bo.PointsExpireLogBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.service.IPointsExpiryLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PointsExpiredLogMsgListener implements MessageListener {

    private final IPointsExpiryLogService pointsExpiryLogService;

    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {
        String body = new String(message.getBody());
        try {
            PointsExpireLogBO bo = JSONUtil.toBean(body, PointsExpireLogBO.class);
            pointsExpiryLogService.recordExpiredPoints(
                    bo.getExpiredPoints(), bo.getOwnerId(), PointsEnum.valueOf(bo.getOwnerType())
            );
        } catch (Exception e) {
            log.error("处理积分过期日志消息失败, 消息体: {}", body, e);
            throw new RuntimeException("处理积分过期日志消息失败");
        }


    }

}