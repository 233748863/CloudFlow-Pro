package cn.joywon.poco.merchant.PointsModule.config;

import cn.joywon.poco.merchant.PointsModule.definition.PointsMsgChannel;
import cn.joywon.poco.merchant.PointsModule.message.listener.PointsAddMsgListener;
import cn.joywon.poco.merchant.PointsModule.message.listener.PointsDedMsgListener;
import cn.joywon.poco.merchant.PointsModule.message.listener.PointsExpiredLogMsgListener;
import cn.joywon.poco.merchant.PointsModule.message.listener.PointsFlowMsgListener;
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
public class PointsRedisMsgConfiguration implements PointsMsgChannel {


    /**
     * 积分增加消息监听器适配器
     */
    @Bean(name = "pointsAddMsgAdapter")
    public MessageListenerAdapter pointsAddMsgListenerAdapter(PointsAddMsgListener receiver) {
        return new MessageListenerAdapter(receiver, "onMessage");
    }


    /**
     * 积分扣减消息监听器适配器
     */
    @Bean(name = "pointsDedMsgAdapter")
    public MessageListenerAdapter pointsDedMsgListenerAdapter(PointsDedMsgListener receiver) {
        return new MessageListenerAdapter(receiver, "onMessage");
    }


    /**
     * 积分变动流水消息监听器适配器
     */
    @Bean("pointsFlowMsgAdapter")
    public MessageListenerAdapter pointsFlowMsgListenerAdapter(PointsFlowMsgListener receiver) {
        return new MessageListenerAdapter(receiver, "onMessage");
    }


    /**
     * 积分过期日志消息监听器适配器
     */
    @Bean(name = "pointsExpiredLogMsgAdapter")
    public MessageListenerAdapter pointsExpiredLogMsgListenerAdapter(PointsExpiredLogMsgListener receiver) {
        return new MessageListenerAdapter(receiver, "onMessage");
    }


    /**
     * 积分消息监听容器
     */
    @Bean(name = "pointsMsgListenerContainer")
    public RedisMessageListenerContainer container(
            RedisConnectionFactory factory,
            @Qualifier("pointsMsgExecutor") ThreadPoolTaskExecutor executor,
            @Qualifier("pointsAddMsgAdapter") MessageListenerAdapter pointsAddMsgAdapter,
            @Qualifier("pointsDedMsgAdapter") MessageListenerAdapter pointsDedMsgAdapter,
            @Qualifier("pointsFlowMsgAdapter") MessageListenerAdapter pointsFlowMsgAdapter,
            @Qualifier("pointsExpiredLogMsgAdapter") MessageListenerAdapter pointsExpiredLogMsgAdapter
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.setTaskExecutor(executor);

        container.addMessageListener(pointsAddMsgAdapter, new ChannelTopic(POINTS_ADD_MESSAGE_TOPIC));
        container.addMessageListener(pointsDedMsgAdapter, new ChannelTopic(POINTS_DED_MESSAGE_TOPIC));
        container.addMessageListener(pointsFlowMsgAdapter, new ChannelTopic(POINTS_FLOW_MESSAGE_TOPIC));
        container.addMessageListener(pointsExpiredLogMsgAdapter, new ChannelTopic(POINTS_EXPIRED_LOG_MESSAGE_TOPIC));


        return container;
    }


    /**
     * 积分消息处理线程池
     */
    @Bean(name = "pointsMsgExecutor")
    public ThreadPoolTaskExecutor executor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        // 核心线程数
        executor.setCorePoolSize(3);
        // 最大线程数
        executor.setMaxPoolSize(10);
        // 队列容量
        executor.setQueueCapacity(100);
        // 线程名称前缀
        executor.setThreadNamePrefix("Points-Msg-Executor-");
        // 拒绝策略：当线程池和队列都满时，由调用者线程执行
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        // 线程存活时间
        executor.setKeepAliveSeconds(60);
        // 初始化线程池
        executor.initialize();

        return executor;
    }


}