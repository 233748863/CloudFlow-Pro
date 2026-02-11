package cn.joywon.poco.merchant.PlatformModule.config;

import cn.joywon.poco.merchant.PlatformModule.listener.BannerActivateListener;
import cn.joywon.poco.merchant.PlatformModule.listener.BannerExpiredListener;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;

@Configuration
public class PlatformRedisMsgConfiguration {

    private static final String EXPIRED_CHANNEL = "__keyevent@0__:expired";


    /**
     * 平台消息监听容器
     */
    @Bean("platformMsgListenerContainer")
    public RedisMessageListenerContainer container(
            RedisConnectionFactory factory,
            @Qualifier("bannerActivateAdapter") MessageListenerAdapter bannerActivateAdapter,
            @Qualifier("bannerExpireAdapter") MessageListenerAdapter bannerExpireAdapter
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();

        container.setConnectionFactory(factory);
        container.addMessageListener(bannerActivateAdapter, new PatternTopic(EXPIRED_CHANNEL));
        container.addMessageListener(bannerExpireAdapter, new PatternTopic(EXPIRED_CHANNEL));

        return container;
    }


    /**
     * 轮播图激活消息适配器
     */
    @Bean("bannerActivateAdapter")
    public MessageListenerAdapter bannerActivateAdapter(BannerActivateListener receiver) {
        return new MessageListenerAdapter(receiver, "onMessage");
    }


    /**
     * 轮播图过期消息适配器
     */
    @Bean("bannerExpireAdapter")
    public MessageListenerAdapter bannerExpireAdapter(BannerExpiredListener receiver) {
        return new MessageListenerAdapter(receiver, "onMessage");
    }


}