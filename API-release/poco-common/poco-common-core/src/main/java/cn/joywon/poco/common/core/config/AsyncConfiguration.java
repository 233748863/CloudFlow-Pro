package cn.joywon.poco.common.core.config;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * 明确异步线程池配置，避免和 @EnableScheduling 造成的线程池冲突
 *
 * @author poco
 * @date 2024/4/20
 */
@Configuration(proxyBeanMethods = false)
@RequiredArgsConstructor
public class AsyncConfiguration implements AsyncConfigurer {

    private ThreadPoolTaskExecutor applicationTaskExecutor;

    public AsyncConfiguration(@Qualifier("applicationTaskExecutor") ThreadPoolTaskExecutor executor) {
        applicationTaskExecutor = executor;
    }

    @Override
    public Executor getAsyncExecutor() {
        return applicationTaskExecutor;
    }

}
