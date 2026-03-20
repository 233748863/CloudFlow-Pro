package com.cloudflow.hr.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * RabbitMQ 配置类
 * 配置消息队列、交换机、绑定关系，用于Auth服务数据同步
 * 
 * @author CloudFlow
 * @since 1.0.0
 */
@Configuration
public class RabbitMQConfig {

    // ==================== 交换机名称 ====================
    public static final String AUTH_SYNC_EXCHANGE = "cloudflow.auth.sync.exchange";
    
    // ==================== 队列名称 ====================
    public static final String DEPT_SYNC_QUEUE = "cloudflow.hr.dept.sync.queue";
    public static final String POST_SYNC_QUEUE = "cloudflow.hr.post.sync.queue";
    
    // ==================== 路由键 ====================
    public static final String DEPT_SYNC_ROUTING_KEY = "auth.dept.sync";
    public static final String POST_SYNC_ROUTING_KEY = "auth.post.sync";

    /**
     * 消息转换器 - 使用 Jackson2JsonMessageConverter
     */
    @Bean
    public MessageConverter messageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    /**
     * RabbitTemplate 配置
     */
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory, MessageConverter messageConverter) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(messageConverter);
        
        // 消息发送确认回调
        rabbitTemplate.setConfirmCallback((correlationData, ack, cause) -> {
            if (ack) {
                System.out.println("消息发送成功：" + correlationData);
            } else {
                System.err.println("消息发送失败：" + cause);
            }
        });
        
        // 消息返回回调（当消息无法路由到队列时触发）
        rabbitTemplate.setReturnsCallback(returned -> {
            System.err.println("消息路由失败：" + returned.getMessage());
        });
        
        return rabbitTemplate;
    }

    /**
     * 监听器容器工厂配置
     */
    @Bean
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory, MessageConverter messageConverter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(messageConverter);
        factory.setConcurrentConsumers(5);
        factory.setMaxConcurrentConsumers(10);
        factory.setPrefetchCount(1);
        return factory;
    }

    /**
     * 声明 Auth 同步交换机（Topic 类型）
     */
    @Bean
    public TopicExchange authSyncExchange() {
        return ExchangeBuilder
                .topicExchange(AUTH_SYNC_EXCHANGE)
                .durable(true)
                .build();
    }

    /**
     * 声明部门同步队列
     */
    @Bean
    public Queue deptSyncQueue() {
        return QueueBuilder
                .durable(DEPT_SYNC_QUEUE)
                .build();
    }

    /**
     * 声明岗位同步队列
     */
    @Bean
    public Queue postSyncQueue() {
        return QueueBuilder
                .durable(POST_SYNC_QUEUE)
                .build();
    }

    /**
     * 绑定部门同步队列到交换机
     */
    @Bean
    public Binding deptSyncBinding(Queue deptSyncQueue, TopicExchange authSyncExchange) {
        return BindingBuilder
                .bind(deptSyncQueue)
                .to(authSyncExchange)
                .with(DEPT_SYNC_ROUTING_KEY);
    }

    /**
     * 绑定岗位同步队列到交换机
     */
    @Bean
    public Binding postSyncBinding(Queue postSyncQueue, TopicExchange authSyncExchange) {
        return BindingBuilder
                .bind(postSyncQueue)
                .to(authSyncExchange)
                .with(POST_SYNC_ROUTING_KEY);
    }
}
