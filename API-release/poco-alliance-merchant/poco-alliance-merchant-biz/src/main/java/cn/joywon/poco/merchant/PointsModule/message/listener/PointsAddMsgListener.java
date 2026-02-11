package cn.joywon.poco.merchant.PointsModule.message.listener;

import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
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
public class PointsAddMsgListener implements MessageListener {

    private final IUserPointsService userPointsService;
    private final IMerchantPointsService merchantPointsService;

    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {
        try {
            String body = new String(message.getBody());
            PointsAddChangeDTO dto = JSONUtil.toBean(body, PointsAddChangeDTO.class);
            switch (PointsEnum.valueOf(dto.getOwnerType())) {
                case USER -> userPointsService.changeAdd(dto);
                case MERCHANT -> merchantPointsService.changeAdd(dto);
            }
        } catch (Exception e) {
            log.error("积分增加变动消息处理失败, 消息体: {}", new String(message.getBody()), e);
        }
    }


}