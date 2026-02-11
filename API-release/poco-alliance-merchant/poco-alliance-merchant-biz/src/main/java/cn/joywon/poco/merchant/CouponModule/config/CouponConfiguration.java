package cn.joywon.poco.merchant.CouponModule.config;

import cn.joywon.poco.merchant.CouponModule.definition.CouponMessageChannel;
import cn.joywon.poco.merchant.CouponModule.listener.CouponRedeemLogMsgListener;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ThreadPoolExecutor;

@Configuration
public class CouponConfiguration implements CouponMessageChannel {


    /**
     * 优惠券核销日志消息适配器
     */
    @Bean(name = "couponRedeemLogMsgAdapter")
    public MessageListenerAdapter couponRedeemLogMsgAdapter(CouponRedeemLogMsgListener receiver) {
        return new MessageListenerAdapter(receiver, "onMessage");
    }


    /**
     * 优惠券功能消息监听容器
     */
    @Bean(name = "couponMsgListenerContainer")
    public RedisMessageListenerContainer container(
            RedisConnectionFactory factory,
            @Qualifier("couponMsgExecutor") ThreadPoolTaskExecutor executor,
            @Qualifier("couponRedeemLogMsgAdapter") MessageListenerAdapter couponRedeemLogMsgAdapter
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.setTaskExecutor(executor);

        container.addMessageListener(couponRedeemLogMsgAdapter, new ChannelTopic(COUPON_REDEEM_LOG_TOPIC));

        return container;
    }


    /**
     * 优惠券消息处理线程池
     */
    @Bean(name = "couponMsgExecutor")
    public ThreadPoolTaskExecutor couponMsgExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        // 核心线程数
        executor.setCorePoolSize(3);
        // 最大线程数
        executor.setMaxPoolSize(10);
        // 队列容量
        executor.setQueueCapacity(100);
        // 线程名称前缀
        executor.setThreadNamePrefix("Coupon-Msg-Executor-");
        // 拒绝策略: 当线程池和队列都满时, 由调用者线程执行
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        // 线程存活时间
        executor.setKeepAliveSeconds(60);
        // 初始化线程池
        executor.initialize();

        return executor;
    }


    /**
     * 联合营销分润结算处理线程池
     */
    @Bean(name = "settlementExecutor")
    public ThreadPoolTaskExecutor settlementExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        // 核心线程数
        executor.setCorePoolSize(10);
        // 最大线程数
        executor.setMaxPoolSize(20);
        // 队列容量
        executor.setQueueCapacity(100);
        // 线程名称前缀
        executor.setThreadNamePrefix("Joint-Settlement-Executor-");
        // 拒绝策略: 当线程池和队列都满时, 由调用者线程执行
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        // 线程存活时间
        executor.setKeepAliveSeconds(60);
        // 初始化线程池
        executor.initialize();

        return executor;
    }


}