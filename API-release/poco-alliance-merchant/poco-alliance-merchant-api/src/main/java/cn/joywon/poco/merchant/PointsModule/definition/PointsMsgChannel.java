package cn.joywon.poco.merchant.PointsModule.definition;

public interface PointsMsgChannel {

    /**
     * 积分增加消息主题
     */
    String POINTS_ADD_MESSAGE_TOPIC = "points_add_message_topic";

    /**
     * 积分扣减消息主题
     */
    String POINTS_DED_MESSAGE_TOPIC = "points_ded_message_topic";

    /**
     * 积分变动流水消息主题
     */
    String POINTS_FLOW_MESSAGE_TOPIC = "points_flow_message_topic";

    /**
     * 积分过期日志消息主题
     */
    String POINTS_EXPIRED_LOG_MESSAGE_TOPIC = "points_expired_log_message_topic";

}