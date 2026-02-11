package cn.joywon.poco.merchant.MarketingModule.config;

import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallMsgChannel;
import cn.joywon.poco.merchant.MarketingModule.message.listener.ProductOnOffShelfMsgListener;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;

@Configuration
public class PointsMallRedisMsgConfiguration implements PointsMallMsgChannel {


    /**
     * 商品上/下架消息监听器适配器
     */
    @Bean(name = "productOnShelfMsgAdapter")
    public MessageListenerAdapter productOnShelfMsgListener(ProductOnOffShelfMsgListener receiver) {
        return new MessageListenerAdapter(receiver, "onMessage");
    }


    /**
     * 积分商城消息监听容器
     */
    @Bean(name = "pointsMallMsgContainer")
    public RedisMessageListenerContainer container(
            RedisConnectionFactory factory,
            @Qualifier("productOnShelfMsgAdapter") MessageListenerAdapter productOnShelfMsgAdapter
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);

        container.addMessageListener(productOnShelfMsgAdapter, new ChannelTopic(PRODUCT_ON_SHELF_MESSAGE_TOPIC));

        return container;
    }

}