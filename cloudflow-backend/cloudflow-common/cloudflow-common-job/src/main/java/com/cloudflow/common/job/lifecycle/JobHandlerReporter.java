package com.cloudflow.common.job.lifecycle;

import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.config.JobHandlerRegistry;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ScheduledFuture;

/** 服务启动后向 auth 上报显式 Handler 白名单。 */
@Component
public class JobHandlerReporter {
    private final JobHandlerRegistry registry;
    private final JobReportClient reportClient;
    private final TaskScheduler heartbeatScheduler;
    private final long heartbeatIntervalMs;
    private ScheduledFuture<?> heartbeatFuture;

    public JobHandlerReporter(JobHandlerRegistry registry,
                              JobReportClient reportClient,
                              @Qualifier("jobHandlerHeartbeatScheduler") TaskScheduler heartbeatScheduler,
                              @Value("${cloudflow.job.handler-report-interval-ms:60000}") long heartbeatIntervalMs) {
        this.registry = registry;
        this.reportClient = reportClient;
        this.heartbeatScheduler = heartbeatScheduler;
        this.heartbeatIntervalMs = Math.max(10000L, heartbeatIntervalMs);
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(Integer.MAX_VALUE)
    public synchronized void report() {
        reportClient.reportHandlers(registry.list());
        if (heartbeatFuture == null) {
            heartbeatFuture = heartbeatScheduler.scheduleWithFixedDelay(
                    this::reportHeartbeat, Duration.ofMillis(heartbeatIntervalMs));
        }
    }

    private void reportHeartbeat() {
        reportClient.reportHandlers(registry.list());
    }

    @PreDestroy
    public synchronized void stop() {
        if (heartbeatFuture != null) {
            heartbeatFuture.cancel(false);
            heartbeatFuture = null;
        }
    }
}
