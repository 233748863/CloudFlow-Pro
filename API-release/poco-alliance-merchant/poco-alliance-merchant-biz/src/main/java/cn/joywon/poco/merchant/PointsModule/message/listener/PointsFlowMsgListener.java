package cn.joywon.poco.merchant.PointsModule.message.listener;

import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowBatchRecordBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowRecordBO;
import cn.joywon.poco.merchant.PointsModule.service.IPointsFlowService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PointsFlowMsgListener implements MessageListener {

    private final IPointsFlowService pointsFlowService;

    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {
        String body = new String(message.getBody());
        try {
            Object obj = JSONUtil.toBean(body, Object.class);
            if (obj instanceof PointsFlowBatchRecordBO bo) {
                pointsFlowService.recordPointsFlows(bo);

            } else if (obj instanceof PointsFlowRecordBO bo) {
                pointsFlowService.saveRecord(bo);
            }
        } catch (Exception e) {
            log.error("处理积分变动流水记录消息失败, 消息体: {}", body, e);
        }
    }

}