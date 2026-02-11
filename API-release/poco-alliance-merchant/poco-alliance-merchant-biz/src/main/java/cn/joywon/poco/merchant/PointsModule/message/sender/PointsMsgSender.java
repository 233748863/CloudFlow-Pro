package cn.joywon.poco.merchant.PointsModule.message.sender;

import cn.hutool.core.lang.Assert;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.PointsModule.bo.PointsExpireLogBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsMsgChannel;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Slf4j
@Component
@RequiredArgsConstructor
public class PointsMsgSender implements PointsMsgChannel {

    private final StringRedisTemplate stringRedisTemplate;


    /**
     * 发送积分变动增加消息
     *
     * @param dto 积分变动增加DTO
     */
    @Validated
    public void sendPointsAddMsg(@Valid PointsAddChangeDTO dto) {
        try {
            String msg = JSONUtil.toJsonStr(dto);
            Long count = stringRedisTemplate.convertAndSend(POINTS_ADD_MESSAGE_TOPIC, msg);
            Assert.isTrue(count != null && count.intValue() != 0, () -> {
                log.error("积分变动增加消息发送失败, 变动积分: {}", dto);
                throw new RuntimeException("积分变动增加消息发送失败");
            });
        } catch (Exception e) {
            log.error("积分变动增加消息发送失败, 变动积分: {}", dto, e);
        }
    }


    /**
     * 发送积分变动扣减消息
     *
     * @param dto 积分变动扣减DTO
     */
    @Validated
    public void sendPointsDedMsg(@Valid PointsDedChangeDTO dto) {
        try {
            String msg = JSONUtil.toJsonStr(dto);
            Long count = stringRedisTemplate.convertAndSend(POINTS_DED_MESSAGE_TOPIC, msg);
            Assert.isTrue(count != null && count.intValue() != 0, () -> {
                log.error("积分变动扣减消息发送失败, 变动积分: {}", dto);
                throw new RuntimeException("积分变动扣减消息发送失败");
            });
        } catch (Exception e) {
            log.error("积分变动扣减消息发送失败, 变动积分: {}", dto, e);
        }
    }


    /**
     * 发送积分变动流水消息
     *
     * @param obj 积分变动流水记录
     */
    public void sendPointsFlowMsg(Object obj) {
        try {
            String msg = JSONUtil.toJsonStr(obj);
            Long count = stringRedisTemplate.convertAndSend(POINTS_FLOW_MESSAGE_TOPIC, msg);
            Assert.isTrue(count != null && count.intValue() != 0, () -> {
                log.error("积分流水消息发送失败, 积分变动流水: {}", obj);
                throw new RuntimeException("积分变动流水消息发送失败");
            });
        } catch (Exception e) {
            log.error("积分流水消息发送失败, 变动流水: {}", obj, e);
        }
    }


    /**
     * 发送积分过期日志消息
     *
     * @param bo 积分过期日志BO
     */
    public void sendPointsExpiredLogMsg(PointsExpireLogBO bo) {
        try {
            String msg = JSONUtil.toJsonStr(bo);
            Long count = stringRedisTemplate.convertAndSend(POINTS_EXPIRED_LOG_MESSAGE_TOPIC, msg);
            Assert.isTrue(count != null && count.intValue() != 0, () -> {
                log.error("积分过期日志消息发送失败, 积分过期日志: {}", bo);
                throw new RuntimeException("积分过期日志消息发送失败");
            });
        } catch (Exception e) {
            log.error("积分过期日志消息发送失败, 过期日志: {}", bo, e);
        }
    }


}