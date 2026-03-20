package com.cloudflow.hr.config;

import feign.Logger;
import feign.Request;
import feign.Retryer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

/**
 * Feign客户端配置
 * 配置超时时间、重试策略和日志级别
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Configuration
public class FeignConfig {
    
    /**
     * 配置Feign日志级别
     * NONE：不记录任何日志（默认）
     * BASIC：仅记录请求方法、URL、响应状态码和执行时间
     * HEADERS：记录BASIC级别的信息，以及请求和响应的头信息
     * FULL：记录请求和响应的头信息、正文和元数据
     *
     * @return Logger.Level
     */
    @Bean
    public Logger.Level feignLoggerLevel() {
        return Logger.Level.BASIC;
    }
    
    /**
     * 配置Feign请求超时时间
     * connectTimeout：连接超时时间
     * readTimeout：读取超时时间
     *
     * @return Request.Options
     */
    @Bean
    public Request.Options feignRequestOptions() {
        // 连接超时：5秒，读取超时：10秒
        return new Request.Options(
            5000, TimeUnit.MILLISECONDS,  // 连接超时
            10000, TimeUnit.MILLISECONDS, // 读取超时
            true                          // 跟随重定向
        );
    }
    
    /**
     * 配置Feign重试策略
     * period：重试间隔时间（毫秒）
     * maxPeriod：最大重试间隔时间（毫秒）
     * maxAttempts：最大重试次数（包括首次请求）
     *
     * @return Retryer
     */
    @Bean
    public Retryer feignRetryer() {
        // 重试间隔100ms，最大间隔1000ms，最多重试3次（包括首次请求）
        return new Retryer.Default(
            100,   // 初始重试间隔（毫秒）
            1000,  // 最大重试间隔（毫秒）
            3      // 最大重试次数（包括首次请求）
        );
    }
}
