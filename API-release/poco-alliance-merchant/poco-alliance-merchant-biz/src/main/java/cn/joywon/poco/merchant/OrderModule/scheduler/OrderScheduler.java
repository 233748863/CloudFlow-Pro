package cn.joywon.poco.merchant.OrderModule.scheduler;

import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.service.OrderService;
import cn.joywon.poco.merchant.OrderModule.definition.OrderStatusEnum;
import cn.joywon.poco.merchant.OrderModule.lock.OrderLockKeys;
import cn.joywon.poco.merchant.OrderModule.lock.OrderLockTimeout;
import cn.joywon.poco.merchant.ReportModule.service.DistributedLockService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

/**
 * 订单模块定时任务调度器
 * 使用Spring原生@Scheduled注解实现定时任务
 * 集成Redisson分布式锁，支持多实例部署
 * 
 * 调度策略：
 * - 每小时整点：执行分账重试任务
 *
 * @author poco
 * @date 2025-01-06
 */
@Component
@EnableScheduling
@Slf4j
@AllArgsConstructor
public class OrderScheduler {

    private final OrderService orderService;
    private final DistributedLockService distributedLockService;

    /**
     * 每小时整点执行 - 分账重试任务
     * Cron表达式: "0 0 * * * ?" 表示每小时整点执行
     * 
     * 使用分布式锁确保多实例环境下只执行一次
     */
    @Scheduled(cron = "0 0 * * * ?")
    public void profitSharingRetry() {
        LocalDateTime now = LocalDateTime.now();
        String lockKey = OrderLockKeys.profitSharingRetryKey(now);
        
        distributedLockService.tryLockAndExecute(
            lockKey,
            OrderLockTimeout.PROFIT_SHARING_RETRY,
            () -> executeProfitSharingRetry(now)
        );
    }

    /**
     * 执行分账重试的具体逻辑
     *
     * @param executeTime 执行时间
     */
    private void executeProfitSharingRetry(LocalDateTime executeTime) {
        log.info("========== 开始执行分账重试任务 ==========");
        long startTime = System.currentTimeMillis();
        int successCount = 0;
        int failCount = 0;

        try {
            // 查询状态为已完成，且分账状态为 1-待分账 或 4-分账失败 的订单
            LambdaQueryWrapper<Order> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(Order::getStatus, OrderStatusEnum.COMPLETED.getCode())
                   .in(Order::getProfitSharingStatus, Arrays.asList(1, 4))
                   .last("LIMIT 100"); // 每次处理100条，避免积压过多

            List<Order> orders = orderService.list(wrapper);
            
            if (orders.isEmpty()) {
                log.info("无需要重试分账的订单");
                return;
            }

            log.info("扫描到 {} 条需要重试分账的订单", orders.size());

            for (Order order : orders) {
                try {
                    log.info("正在重试订单分账, orderId: {}", order.getId());
                    orderService.triggerProfitSharing(order);
                    successCount++;
                } catch (Exception e) {
                    log.error("订单分账重试失败, orderId: {}", order.getId(), e);
                    failCount++;
                }
            }

        } catch (Exception e) {
            log.error("分账重试任务执行异常", e);
            throw e;
        } finally {
            long costTime = System.currentTimeMillis() - startTime;
            log.info("========== 分账重试任务完成 ==========");
            log.info("执行时间: {}, 成功: {}, 失败: {}, 耗时: {}ms", 
                executeTime, successCount, failCount, costTime);
        }
    }

    /**
     * 手动触发分账重试
     * 可通过Controller接口调用
     *
     * @param forceExecute 是否强制执行（跳过锁检查）
     */
    public void manualProfitSharingRetry(boolean forceExecute) {
        LocalDateTime now = LocalDateTime.now();
        log.info("手动触发分账重试任务，执行时间: {}, 强制执行: {}", now, forceExecute);
        
        if (forceExecute) {
            log.warn("强制执行分账重试任务，跳过分布式锁检查");
            executeProfitSharingRetry(now);
            return;
        }
        
        String lockKey = OrderLockKeys.profitSharingRetryKey(now);
        boolean executed = distributedLockService.tryLockAndExecute(
            lockKey,
            OrderLockTimeout.PROFIT_SHARING_RETRY,
            () -> executeProfitSharingRetry(now)
        );
        
        if (!executed) {
            throw new RuntimeException("获取分布式锁失败，任务正在执行中，锁Key: " + lockKey);
        }
    }

    /**
     * 手动触发分账重试（默认不强制执行）
     */
    public void manualProfitSharingRetry() {
        manualProfitSharingRetry(false);
    }
}
