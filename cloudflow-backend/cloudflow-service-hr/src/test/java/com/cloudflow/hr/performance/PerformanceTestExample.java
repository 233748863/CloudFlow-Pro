package com.cloudflow.hr.performance;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 性能测试示例
 * 
 * 注意：此测试类默认被禁用（@Disabled），仅在需要进行性能测试时手动启用
 * 
 * 测试场景：
 * 1. 员工列表查询并发测试
 * 2. 打卡接口并发测试
 * 3. 请假申请并发测试
 * 
 * @author CloudFlow
 * @since 1.0.0
 */
@SpringBootTest
@ActiveProfiles("test")
@Disabled("性能测试默认禁用，需要时手动启用")
public class PerformanceTestExample {

    /**
     * 并发测试示例：员工列表查询
     * 
     * 测试目标：
     * - 并发用户数：100
     * - 预期响应时间：P95 < 500ms
     * - 预期吞吐量：> 200 TPS
     */
    @Test
    public void testEmployeeListQueryConcurrency() throws InterruptedException {
        int concurrentUsers = 100;
        int requestsPerUser = 10;
        
        ExecutorService executorService = Executors.newFixedThreadPool(concurrentUsers);
        CountDownLatch latch = new CountDownLatch(concurrentUsers * requestsPerUser);
        
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);
        
        long startTime = System.currentTimeMillis();
        
        for (int i = 0; i < concurrentUsers; i++) {
            for (int j = 0; j < requestsPerUser; j++) {
                executorService.submit(() -> {
                    try {
                        // TODO: 调用员工列表查询接口
                        // employeeService.listEmployees(query);
                        successCount.incrementAndGet();
                    } catch (Exception e) {
                        failureCount.incrementAndGet();
                        e.printStackTrace();
                    } finally {
                        latch.countDown();
                    }
                });
            }
        }
        
        latch.await();
        long endTime = System.currentTimeMillis();
        
        executorService.shutdown();
        
        // 输出测试结果
        long totalTime = endTime - startTime;
        int totalRequests = concurrentUsers * requestsPerUser;
        double tps = (double) totalRequests / (totalTime / 1000.0);
        double avgResponseTime = (double) totalTime / totalRequests;
        
        System.out.println("========== 性能测试结果 ==========");
        System.out.println("并发用户数: " + concurrentUsers);
        System.out.println("每用户请求数: " + requestsPerUser);
        System.out.println("总请求数: " + totalRequests);
        System.out.println("成功请求数: " + successCount.get());
        System.out.println("失败请求数: " + failureCount.get());
        System.out.println("总耗时: " + totalTime + " ms");
        System.out.println("平均响应时间: " + String.format("%.2f", avgResponseTime) + " ms");
        System.out.println("吞吐量(TPS): " + String.format("%.2f", tps));
        System.out.println("================================");
    }

    /**
     * 并发测试示例：打卡接口
     * 
     * 测试目标：
     * - 并发用户数：1000（模拟上下班高峰）
     * - 预期响应时间：< 200ms
     * - 预期吞吐量：> 1000 TPS
     */
    @Test
    public void testAttendanceCheckInConcurrency() throws InterruptedException {
        int concurrentUsers = 1000;
        
        ExecutorService executorService = Executors.newFixedThreadPool(concurrentUsers);
        CountDownLatch latch = new CountDownLatch(concurrentUsers);
        
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);
        
        long startTime = System.currentTimeMillis();
        
        for (int i = 0; i < concurrentUsers; i++) {
            final int userId = i + 1;
            executorService.submit(() -> {
                try {
                    // TODO: 调用打卡接口
                    // attendanceService.checkIn(dto);
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    failureCount.incrementAndGet();
                    e.printStackTrace();
                } finally {
                    latch.countDown();
                }
            });
        }
        
        latch.await();
        long endTime = System.currentTimeMillis();
        
        executorService.shutdown();
        
        // 输出测试结果
        long totalTime = endTime - startTime;
        double tps = (double) concurrentUsers / (totalTime / 1000.0);
        double avgResponseTime = (double) totalTime / concurrentUsers;
        
        System.out.println("========== 打卡并发测试结果 ==========");
        System.out.println("并发用户数: " + concurrentUsers);
        System.out.println("成功请求数: " + successCount.get());
        System.out.println("失败请求数: " + failureCount.get());
        System.out.println("总耗时: " + totalTime + " ms");
        System.out.println("平均响应时间: " + String.format("%.2f", avgResponseTime) + " ms");
        System.out.println("吞吐量(TPS): " + String.format("%.2f", tps));
        System.out.println("====================================");
    }

    /**
     * 并发测试示例：请假申请（测试乐观锁和额度扣减）
     * 
     * 测试目标：
     * - 并发用户数：50
     * - 验证假期额度扣减的正确性
     * - 验证乐观锁机制
     */
    @Test
    public void testLeaveApplicationConcurrency() throws InterruptedException {
        int concurrentUsers = 50;
        
        ExecutorService executorService = Executors.newFixedThreadPool(concurrentUsers);
        CountDownLatch latch = new CountDownLatch(concurrentUsers);
        
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);
        
        long startTime = System.currentTimeMillis();
        
        for (int i = 0; i < concurrentUsers; i++) {
            executorService.submit(() -> {
                try {
                    // TODO: 调用请假申请接口
                    // leaveService.createLeaveApplication(dto);
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    failureCount.incrementAndGet();
                    // 预期部分请求会因为额度不足而失败
                } finally {
                    latch.countDown();
                }
            });
        }
        
        latch.await();
        long endTime = System.currentTimeMillis();
        
        executorService.shutdown();
        
        // 输出测试结果
        long totalTime = endTime - startTime;
        double avgResponseTime = (double) totalTime / concurrentUsers;
        
        System.out.println("========== 请假申请并发测试结果 ==========");
        System.out.println("并发用户数: " + concurrentUsers);
        System.out.println("成功请求数: " + successCount.get());
        System.out.println("失败请求数: " + failureCount.get());
        System.out.println("总耗时: " + totalTime + " ms");
        System.out.println("平均响应时间: " + String.format("%.2f", avgResponseTime) + " ms");
        System.out.println("========================================");
        
        // TODO: 验证假期额度扣减的正确性
        // 查询数据库中的假期额度，确保扣减正确
    }
}
