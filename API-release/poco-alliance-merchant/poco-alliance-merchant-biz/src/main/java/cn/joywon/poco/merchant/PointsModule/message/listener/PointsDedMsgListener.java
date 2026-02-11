package cn.joywon.poco.merchant.PointsModule.message.listener;

import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import cn.joywon.poco.merchant.PointsModule.service.IMerchantPointsService;
import cn.joywon.poco.merchant.PointsModule.service.IUserPointsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PointsDedMsgListener implements MessageListener {

    private final IUserPointsService userPointsService;
    private final IMerchantPointsService merchantPointsService;


    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {
        try {
            String body = new String(message.getBody());
            PointsDedChangeDTO dto = JSONUtil.toBean(body, PointsDedChangeDTO.class);
            switch (PointsEnum.valueOf(dto.getOwnerType())) {
                case USER -> userPointsService.changeDed(dto);
                case MERCHANT -> merchantPointsService.changeDed(dto);
            }
        } catch (Exception e) {
            log.error("积分减少变动消息处理失败, 消息体: {}", new String(message.getBody()), e);
        }
    }


}