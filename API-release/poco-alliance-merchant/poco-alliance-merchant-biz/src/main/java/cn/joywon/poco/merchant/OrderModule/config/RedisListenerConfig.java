package cn.joywon.poco.merchant.OrderModule.config;

import cn.joywon.poco.merchant.OrderModule.listener.CancelApplyExpireListener;
import cn.joywon.poco.merchant.OrderModule.listener.PayNotifyListener;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;

/**
 * Redis监听配置
 */
@Configuration
public class RedisListenerConfig {

    @Bean("orderContainer")
    RedisMessageListenerContainer container(RedisConnectionFactory connectionFactory,
                                            MessageListenerAdapter listenerAdapter,
                                            MessageListenerAdapter refundListenerAdapter) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(listenerAdapter, new PatternTopic("PAY_SUCCESS_CHANNEL"));
        container.addMessageListener(refundListenerAdapter, new PatternTopic("REFUND_SUCCESS_CHANNEL"));
        return container;
    }

    @Bean
    MessageListenerAdapter listenerAdapter(PayNotifyListener listener) {
        return new MessageListenerAdapter(listener, "handleMessage");
    }

    @Bean
    MessageListenerAdapter refundListenerAdapter(PayNotifyListener listener) {
        return new MessageListenerAdapter(listener, "handleRefundMessage");
    }

    @Bean
    public CancelApplyExpireListener cancelApplyExpireListener(@Qualifier("orderContainer") RedisMessageListenerContainer listenerContainer) {
        return new CancelApplyExpireListener(listenerContainer);
    }
}
