package cn.joywon.poco.merchant.CouponModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.bo.RecordProcessResult;
import cn.joywon.poco.merchant.CouponModule.bo.SettlementBatchResult;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingRebateRecordPageDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingSettlementExecuteDTO;
import cn.joywon.poco.merchant.CouponModule.dto.SettlementRetryDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingRebateRecord;
import cn.joywon.poco.merchant.CouponModule.entity.UserCoupon;
import cn.joywon.poco.merchant.CouponModule.feign.RemotePayService;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingRebateRecordMapper;
import cn.joywon.poco.merchant.CouponModule.monitor.JointMarketingSettlementMonitor;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingSettlementService;
import cn.joywon.poco.merchant.CouponModule.service.IUserCouponService;
import cn.joywon.poco.merchant.CouponModule.vo.SettlementStatusVO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static cn.joywon.poco.merchant.CouponModule.lock.JointMarketingLockKeys.JOINT_MARKETING_SETTLEMENT_LOCK;
import static cn.joywon.poco.merchant.CouponModule.lock.JointMarketingLockKeys.SETTLEMENT_RECORD_BATCH_SIZE;

@Slf4j
@Service
@RequiredArgsConstructor
public class JointMarketingSettlementServiceImpl implements IJointMarketingSettlementService {

    private final RedissonClient redissonClient;

    private final JointMarketingRebateRecordMapper rebateRecordMapper;
    private final RemotePayService remotePayService;
    private final PlatformTransactionManager transactionManager;
    private final IUserCouponService userCouponService;

    @Qualifier("settlementExecutor")
    private final ThreadPoolTaskExecutor settlementExecutor;
    private final JointMarketingSettlementMonitor settlementMonitor;

    private final ConcurrentHashMap<String, SettlementStatusVO> settlementStatusMap = new ConcurrentHashMap<>();
    private final ScheduledExecutorService statusMonitor = Executors.newSingleThreadScheduledExecutor();

    @Override
    public R<PageQueryVO<JointMarketingRebateRecord>> pageRebateRecord(JointMarketingRebateRecordPageDTO dto) {
        Long currentMerchantId = SecurityUtils.getUser().getDeptId();

        Page<JointMarketingRebateRecord> page = new Page<>(dto.getPageNum(), dto.getPageSize());

        LambdaQueryWrapper<JointMarketingRebateRecord> wrapper = new LambdaQueryWrapper<>();

        // 1. 基础筛选
        wrapper.eq(dto.getPlanId() != null, JointMarketingRebateRecord::getPlanId, dto.getPlanId())
                .eq(dto.getRuleId() != null, JointMarketingRebateRecord::getRuleId, dto.getRuleId())
                .eq(StrUtil.isNotBlank(dto.getStatus()), JointMarketingRebateRecord::getStatus, dto.getStatus())
                .ge(dto.getStartDate() != null, JointMarketingRebateRecord::getCreatedTime, dto.getStartDate() != null ? dto.getStartDate().atStartOfDay() : null)
                .le(dto.getEndDate() != null, JointMarketingRebateRecord::getCreatedTime, dto.getEndDate() != null ? dto.getEndDate().atTime(LocalTime.MAX) : null);

        // 2. 权限控制: 只看我是 payer 或 payee 的记录
        wrapper.and(w -> w.eq(JointMarketingRebateRecord::getPayerMerchantId, currentMerchantId)
                .or()
                .eq(JointMarketingRebateRecord::getPayeeMerchantId, currentMerchantId));

        wrapper.orderByDesc(JointMarketingRebateRecord::getCreatedTime);

        Page<JointMarketingRebateRecord> result = rebateRecordMapper.selectPage(page, wrapper);

        return R.ok(PageQueryVO.of(result));
    }

    @Override
    public R<SettlementStatusVO> getSettlementStatus(String batchId) {
        SettlementStatusVO status = settlementStatusMap.get(batchId);
        if (status == null) {
            return R.failed("结算任务不存在或已过期");
        }
        return R.ok(status);
    }

    @Override
    @Scheduled(cron = "0 0 1 * * ?")
    public void executeMonthlySettlement() {
        RLock lock = redissonClient.getLock(JOINT_MARKETING_SETTLEMENT_LOCK);

        try {
            // 通过分布式锁防止任务重复执行
            if (!lock.tryLock(0, 30, TimeUnit.SECONDS)) {
                log.info("联合营销处理结算任务已在其他节点执行，跳过本次执行");
                return;
            }

            log.info("开始执行联合营销月度结算...");
            settlementMonitor.startSettlementBatch();
            // 分批次处理, 避免内存溢出
            int totalProcessed = 0;
            int offset = 0;
            while (true) {
                // 分批查询待结算记录
                List<JointMarketingRebateRecord> records = getPendingSettlementRecords(offset, SETTLEMENT_RECORD_BATCH_SIZE);
                if (CollUtil.isEmpty(records)) {
                    break;
                }
                // 并行处理批次
                processBatchInParallel(records);
                totalProcessed += records.size();
                offset += SETTLEMENT_RECORD_BATCH_SIZE;

                // 防止无限循环
                if (records.size() < SETTLEMENT_RECORD_BATCH_SIZE) {
                    break;
                }
            }

            settlementMonitor.completeSettlementBatch(totalProcessed);
            log.info("联合营销月度结算完成, 处理记录数: {}", totalProcessed);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("结算任务被中断", e);
        } catch (Exception e) {
            log.error("结算任务执行失败", e);
            settlementMonitor.recordSettlementFailure(e);
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }

    }

    @Override
    public R<?> executeSettlement(JointMarketingSettlementExecuteDTO dto) {
        String batchId = "SETTLEMENT_" + System.currentTimeMillis() + "_" + ThreadLocalRandom.current().nextInt(1000);

        try {
            // 1. 创建结算状态跟踪
            SettlementStatusVO status = new SettlementStatusVO();
            status.setBatchId(batchId);
            status.setStatus("PROCESSING");
            status.setStartTime(LocalDateTime.now());
            status.setProgress(0);
            settlementStatusMap.put(batchId, status);

            // 2. 异步执行结算
            CompletableFuture.runAsync(() -> {
                try {
                    executeManualSettlement(batchId, dto);
                } catch (Exception e) {
                    log.error("手动结算执行失败, batchId: {}", batchId, e);
                    SettlementStatusVO failedStatus = settlementStatusMap.get(batchId);
                    if (failedStatus != null) {
                        failedStatus.setStatus("FAILED");
                        failedStatus.setErrorMessage(e.getMessage());
                        failedStatus.setEndTime(LocalDateTime.now());
                    }
                }
            }, settlementExecutor);

            // 3. 启动状态监控
            startStatusMonitoring(batchId);
            log.info("手动结算任务已启动, batchId: {}, planId: {}", batchId, dto.getPlanId());
            return R.ok(batchId);

        } catch (Exception e) {
            log.error("启动手动结算失败", e);
            return R.failed("启动手动结算失败: " + e.getMessage());
        }
    }

    @Override
    public R<?> retrySettlement(SettlementRetryDTO dto) {
        try {
            // 1. 查询记录
            JointMarketingRebateRecord record = rebateRecordMapper.selectById(dto.getRecordId());
            if (record == null) {
                return R.failed("返利记录不存在");
            }

            // 2. 权限校验
            Long currentMerchantId = SecurityUtils.getUser().getDeptId();
            if (!currentMerchantId.equals(record.getPayerMerchantId()) &&
                    !currentMerchantId.equals(record.getPayeeMerchantId())) {
                return R.failed("无权限操作此记录");
            }

            // 3. 状态校验
            if (!"SETTLEMENT_FAILED".equals(record.getStatus())) {
                return R.failed("只有失败的记录可以重试");
            }

            // 4. 重试次数校验
            if (!dto.getForceRetry() && record.getRetryCount() != null && record.getRetryCount() >= 3) {
                return R.failed("重试次数已达上限, 请确认失败原因");
            }

            // 5. 执行重试
            boolean success = processSingleRecordWithRetrySync(record);

            if (success) {
                log.info("结算记录重试成功, recordId: {}", dto.getRecordId());
                return R.ok(true);
            } else {
                return R.failed("结算记录重试失败");
            }

        } catch (Exception e) {
            log.error("结算记录重试失败", e);
            return R.failed("结算记录重试失败: " + e.getMessage());
        }
    }

    @Override
    public R<Boolean> cancelSettlement(String batchId) {
        try {
            SettlementStatusVO status = settlementStatusMap.get(batchId);
            if (status == null) {
                return R.failed("结算任务不存在或已过期");
            }

            if ("COMPLETED".equals(status.getStatus()) || "FAILED".equals(status.getStatus())) {
                return R.failed("结算任务已结束，无法取消");
            }

            status.setStatus("CANCELLED");
            status.setEndTime(LocalDateTime.now());
            status.setErrorMessage("用户手动取消");

            log.info("结算任务已取消, batchId: {}", batchId);
            return R.ok(true);

        } catch (Exception e) {
            log.error("取消结算任务失败", e);
            return R.failed("取消结算任务失败");
        }
    }

    @Override
    public void scanExpiredRebateRecords() {
        log.info("开始扫描过期的联合营销返利记录...");

        // 1. 查询所有待核销 (WAITING_VERIFY) 的记录
        List<JointMarketingRebateRecord> records = rebateRecordMapper.selectList(new LambdaQueryWrapper<JointMarketingRebateRecord>()
                .eq(JointMarketingRebateRecord::getStatus, "WAITING_VERIFY"));

        if (CollUtil.isEmpty(records)) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        int expiredCount = 0;

        for (JointMarketingRebateRecord record : records) {
            // 2. 检查对应的优惠券是否已过期
            UserCoupon userCoupon = userCouponService.getById(record.getCouponId());
            if (userCoupon == null) {
                // 优惠券丢失，异常情况，取消记录
                record.setStatus("CANCELLED");
                record.setFailureReason("关联优惠券不存在");
                rebateRecordMapper.updateById(record);
                continue;
            }

            boolean isExpired = false;
            // 检查状态
            if (CouponStatusEnum.USER_COUPON_EXPIRED.equals(userCoupon.getCouponStatus())) {
                isExpired = true;
            } else if (CouponStatusEnum.USER_COUPON_UNUSED.equals(userCoupon.getCouponStatus())) {
                // 检查时间
                if (userCoupon.getValidEndTime() != null && now.isAfter(userCoupon.getValidEndTime())) {
                    isExpired = true;
                    // 同步更新优惠券状态
                    userCoupon.setCouponStatus(CouponStatusEnum.USER_COUPON_EXPIRED);
                    userCouponService.updateById(userCoupon);
                }
            }

            if (isExpired) {
                record.setStatus("CANCELLED");
                record.setFailureReason("优惠券已过期");
                rebateRecordMapper.updateById(record);
                expiredCount++;
            }
        }

        log.info("过期记录扫描完成, 处理过期记录数: {}", expiredCount);
    }

    private void processSingleRecord(JointMarketingRebateRecord record, TransactionTemplate transactionTemplate) {
        try {
            // 检查重试次数 (双重检查)
            if ("SETTLEMENT_FAILED".equals(record.getStatus()) && record.getRetryCount() != null && record.getRetryCount() >= 3) {
                return;
            }

            // 2. 执行转账逻辑 (非事务性远程调用)
            boolean transferSuccess = false;
            String errorMsg = null;

            try {
                transferSuccess = executeTransfer(record.getId(), record.getPayerMerchantId(), record.getPayeeMerchantId(), record.getAmount(), record.getPayeeRole());
                if (!transferSuccess) {
                    errorMsg = "转账返回失败";
                }
            } catch (Exception e) {
                log.error("转账调用异常", e);
                errorMsg = "转账异常: " + e.getMessage();
                transferSuccess = false;
            }

            // 3. 更新数据库 (事务性)
            final boolean finalSuccess = transferSuccess;
            final String finalErrorMsg = errorMsg;

            transactionTemplate.executeWithoutResult(status -> {
                // 重新读取记录以防并发修改 (虽然定时任务一般单线程，但为了稳健)
                // 这里为了性能直接使用传入的 record 对象，但在高并发下建议 selectById 加锁
                // 考虑到是批量任务，直接更新

                if (finalSuccess) {
                    record.setStatus("SETTLED");
                    record.setSettledTime(LocalDateTime.now());
                    record.setFailureReason(""); // 清空错误原因
                } else {
                    record.setStatus("SETTLEMENT_FAILED");
                    record.setFailureReason(finalErrorMsg);
                    record.setRetryCount(record.getRetryCount() == null ? 1 : record.getRetryCount() + 1);
                }
                rebateRecordMapper.updateById(record);
            });

        } catch (Exception e) {
            log.error("结算记录处理严重错误, id: {}", record.getId(), e);
            // 尝试记录严重错误（如果数据库连接正常）
            try {
                record.setStatus("SETTLEMENT_FAILED");
                record.setFailureReason("系统严重错误: " + e.getMessage());
                rebateRecordMapper.updateById(record);
            } catch (Exception ex) {
                log.error("无法更新记录状态, id: {}", record.getId(), ex);
            }
        }
    }

    /**
     * 执行转账
     *
     * @param recordId  记录ID (用于幂等控制)
     * @param payerId   付款方商家ID
     * @param payeeId   收款方商家ID
     * @param amount    金额
     * @param payeeRole 收款方角色
     * @return 是否成功
     */
    private boolean executeTransfer(Long recordId, Long payerId, Long payeeId, BigDecimal amount, String payeeRole) {
        log.info("调用支付平台分账服务: {} -> {}, 金额: {}, 角色: {}, 业务ID: {}", payerId, payeeId, amount, payeeRole, recordId);

        try {
            // 构建分账请求参数
            Map<String, String> params = new HashMap<>();
            params.put("bizId", String.valueOf(recordId));
            params.put("payerId", String.valueOf(payerId));
            params.put("payeeId", String.valueOf(payeeId));
            params.put("amount", amount.toString());
            params.put("payeeRole", payeeRole);
            params.put("bizType", "JOINT_MARKETING_REBATE");

            R<String> result = remotePayService.submitProfitSharing(params);

            if (result.getCode() == 0) { // 假设0是成功
                log.info("分账成功: {}", result.getData());
                return true;
            } else {
                log.error("分账失败: {}", result.getMsg());
                return false;
            }
        } catch (Exception e) {
            log.error("调用分账服务异常", e);
            return false;
        }
    }

    /**
     * 分批查询待结算记录
     */
    private List<JointMarketingRebateRecord> getPendingSettlementRecords(int offset, int limit) {
        return rebateRecordMapper.selectList(new LambdaQueryWrapper<JointMarketingRebateRecord>()
                .in(JointMarketingRebateRecord::getStatus, Arrays.asList("PENDING_SETTLEMENT", "SETTLEMENT_FAILED"))
                .lt(JointMarketingRebateRecord::getRetryCount, 3)
                // 优先处理较早的记录
                .orderByAsc(JointMarketingRebateRecord::getCreatedTime)
                .last(String.format("LIMIT %d OFFSET %d", limit, offset)));
    }

    /**
     * 并行处理结算批次
     */
    private void processBatchInParallel(List<JointMarketingRebateRecord> records) {
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);

        for (JointMarketingRebateRecord record : records) {
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                try {
                    processSingleRecordWithRetry(record);
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    failureCount.incrementAndGet();
                    log.error("处理结算记录失败, ID: {}", record.getId(), e);
                }
            }, settlementExecutor);

            futures.add(future);
        }

        // 等待所有任务完成
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        log.info("批次处理完成, 成功: {}, 失败: {}, 总数: {}",
                successCount.get(), failureCount.get(), records.size());
    }

    /**
     * 结算批次单记录处理方法 - 支持重试和记录锁
     */
    private void processSingleRecordWithRetry(JointMarketingRebateRecord record) {
        String recordLockKey = "settlement_record_lock_" + record.getId();
        RLock recordLock = redissonClient.getLock(recordLockKey);

        try {
            // 对单个记录加锁，防止并发处理
            if (!recordLock.tryLock(5, 30, TimeUnit.SECONDS)) {
                log.warn("记录正在被其他线程处理, ID: {}", record.getId());
                return;
            }

            // 重新查询记录状态，防止重复处理
            JointMarketingRebateRecord freshRecord = rebateRecordMapper.selectById(record.getId());
            if (freshRecord == null || !freshRecord.getStatus().equals(record.getStatus())) {
                log.info("记录状态已变更, 跳过处理, ID: {}", record.getId());
                return;
            }

            processSingleRecord(freshRecord);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("记录处理被中断, ID: {}", record.getId(), e);
        } catch (Exception e) {
            log.error("记录处理失败, ID: {}", record.getId(), e);
        } finally {
            if (recordLock.isHeldByCurrentThread()) {
                recordLock.unlock();
            }
        }
    }

    /**
     * 改进的单记录处理方法
     */
    private void processSingleRecord(JointMarketingRebateRecord record) {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);

        try {
            // 检查重试次数
            if ("SETTLEMENT_FAILED".equals(record.getStatus()) &&
                    record.getRetryCount() != null && record.getRetryCount() >= 3) {
                return;
            }

            // 执行转账逻辑
            boolean transferSuccess = false;
            String errorMsg = null;

            try {
                transferSuccess = executeTransferWithTimeout(record);
                if (!transferSuccess) {
                    errorMsg = "转账返回失败";
                }
            } catch (Exception e) {
                log.error("转账调用异常, ID: {}", record.getId(), e);
                errorMsg = "转账异常: " + e.getMessage();
                transferSuccess = false;
            }

            // 更新数据库
            final boolean finalSuccess = transferSuccess;
            final String finalErrorMsg = errorMsg;

            transactionTemplate.executeWithoutResult(status -> {
                JointMarketingRebateRecord freshRecord = rebateRecordMapper.selectById(record.getId());
                if (freshRecord == null) {
                    return;
                }

                if (finalSuccess) {
                    freshRecord.setStatus("SETTLED");
                    freshRecord.setSettledTime(LocalDateTime.now());
                    freshRecord.setFailureReason("");
                    freshRecord.setRetryCount(0);
                } else {
                    freshRecord.setStatus("SETTLEMENT_FAILED");
                    freshRecord.setFailureReason(finalErrorMsg);
                    freshRecord.setRetryCount(freshRecord.getRetryCount() == null ? 1 : freshRecord.getRetryCount() + 1);
                }

                rebateRecordMapper.updateById(freshRecord);
                settlementMonitor.recordProcessed(finalSuccess);
            });

        } catch (Exception e) {
            log.error("结算记录处理严重错误, id: {}", record.getId(), e);

            try {
                record.setStatus("SETTLEMENT_FAILED");
                record.setFailureReason("系统严重错误: " + e.getMessage());
                rebateRecordMapper.updateById(record);
                settlementMonitor.recordProcessed(false);
            } catch (Exception ex) {
                log.error("无法更新记录状态, id: {}", record.getId(), ex);
            }
        }

    }

    /**
     * 带超时控制的转账执行
     */
    private boolean executeTransferWithTimeout(JointMarketingRebateRecord record) {
        try {
            // 构建分账请求参数
            Map<String, String> params = new HashMap<>();
            params.put("bizId", String.valueOf(record.getId()));
            params.put("payerId", String.valueOf(record.getPayerMerchantId()));
            params.put("payeeId", String.valueOf(record.getPayeeMerchantId()));
            params.put("amount", record.getAmount().toString());
            params.put("payeeRole", record.getPayeeRole());
            params.put("bizType", "JOINT_MARKETING_REBATE");

            // 设置超时时间
            R<String> result = CompletableFuture.supplyAsync(() ->
                            remotePayService.submitProfitSharing(params), settlementExecutor)
                    .get(30, TimeUnit.SECONDS); // 30秒超时

            if (result.getCode() == 0) {
                log.info("分账成功: {}", result.getData());
                return true;
            } else {
                log.error("分账失败: {}", result.getMsg());
                return false;
            }
        } catch (Exception e) {
            log.error("转账执行超时或异常, ID: {}", record.getId(), e);
            return false;
        }
    }

    /**
     * 执行手动结算
     */
    private void executeManualSettlement(String batchId, JointMarketingSettlementExecuteDTO dto) {
        SettlementStatusVO status = settlementStatusMap.get(batchId);
        if (status == null) {
            throw new RuntimeException("结算状态不存在");
        }

        try {
            // 1. 查询待结算记录
            List<JointMarketingRebateRecord> records = getManualSettlementRecords(dto);
            if (records.isEmpty()) {
                status.setStatus("COMPLETED");
                status.setTotalRecords(0);
                status.setSuccessRecords(0);
                status.setFailureRecords(0);
                status.setEndTime(LocalDateTime.now());
                status.setProgress(100);
                return;
            }

            // 2. 更新状态
            status.setTotalRecords(records.size());
            status.setTotalAmount(records.stream()
                    .map(JointMarketingRebateRecord::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add));

            // 3. 分批处理
            int batchSize = dto.getBatchSize() != null ? dto.getBatchSize() : 100;
            int totalProcessed = 0;
            int successCount = 0;
            BigDecimal successAmount = BigDecimal.ZERO;

            for (int i = 0; i < records.size(); i += batchSize) {
                if ("CANCELLED".equals(status.getStatus())) {
                    log.info("结算任务被取消, batchId: {}", batchId);
                    break;
                }

                List<JointMarketingRebateRecord> batch = records.subList(i,
                        Math.min(i + batchSize, records.size()));

                // 处理批次
                SettlementBatchResult result = processSettlementBatch(batch, dto.getForceRetry());
                totalProcessed += batch.size();
                successCount += result.getSuccessCount();
                successAmount = successAmount.add(result.getSuccessAmount());

                // 更新进度
                status.setSuccessRecords(successCount);
                status.setFailureRecords(totalProcessed - successCount);
                status.setSuccessAmount(successAmount);
                status.setProgress((int) ((double) totalProcessed / records.size() * 100));

                log.info("手动结算进度: {}/{}, 成功: {}, 失败: {}",
                        totalProcessed, records.size(), successCount, totalProcessed - successCount);
            }

            // 4. 完成结算
            status.setStatus("COMPLETED");
            status.setEndTime(LocalDateTime.now());
            status.setProgress(100);

            log.info("手动结算完成, batchId: {}, 总数: {}, 成功: {}, 失败: {}",
                    batchId, records.size(), successCount, records.size() - successCount);

        } catch (Exception e) {
            status.setStatus("FAILED");
            status.setErrorMessage(e.getMessage());
            status.setEndTime(LocalDateTime.now());
            throw e;
        }
    }

    /**
     * 处理结算批次
     */
    private List<JointMarketingRebateRecord> getManualSettlementRecords(JointMarketingSettlementExecuteDTO dto) {
        LambdaQueryWrapper<JointMarketingRebateRecord> wrapper = new LambdaQueryWrapper<>();

        wrapper.eq(JointMarketingRebateRecord::getPlanId, dto.getPlanId())
                .in(JointMarketingRebateRecord::getStatus,
                        Arrays.asList("PENDING_SETTLEMENT", "SETTLEMENT_FAILED"));

        if (dto.getStartDate() != null) {
            wrapper.ge(JointMarketingRebateRecord::getCreatedTime, dto.getStartDate().atStartOfDay());
        }
        if (dto.getEndDate() != null) {
            wrapper.le(JointMarketingRebateRecord::getCreatedTime, dto.getEndDate().atTime(LocalTime.MAX));
        }

        if (!Boolean.TRUE.equals(dto.getForceRetry())) {
            wrapper.lt(JointMarketingRebateRecord::getRetryCount, 3);
        }

        wrapper.orderByAsc(JointMarketingRebateRecord::getCreatedTime);

        return rebateRecordMapper.selectList(wrapper);
    }

    /**
     * 获取手动结算的返利记录
     */
    private void startStatusMonitoring(String batchId) {
        statusMonitor.scheduleAtFixedRate(() -> {
            SettlementStatusVO status = settlementStatusMap.get(batchId);
            if (status == null ||
                    "COMPLETED".equals(status.getStatus()) ||
                    "FAILED".equals(status.getStatus()) ||
                    "CANCELLED".equals(status.getStatus())) {

                // 清理过期的状态记录（保留1小时）
                if (status != null && status.getEndTime() != null &&
                        Duration.between(status.getEndTime(), LocalDateTime.now()).toHours() > 1) {
                    settlementStatusMap.remove(batchId);
                }
                return;
            }

            // 更新状态信息
            log.debug("结算任务监控中, batchId: {}, 进度: {}%", batchId, status.getProgress());
        }, 30, 30, TimeUnit.SECONDS);
    }

    /**
     * 处理结算批次并返回结果
     */
    private SettlementBatchResult processSettlementBatch(List<JointMarketingRebateRecord> batch, Boolean forceRetry) {
        SettlementBatchResult result = new SettlementBatchResult();
        long startTime = System.currentTimeMillis();

        try {
            List<CompletableFuture<RecordProcessResult>> futures = new ArrayList<>();

            for (JointMarketingRebateRecord record : batch) {
                CompletableFuture<RecordProcessResult> future = CompletableFuture.supplyAsync(
                        () -> processSingleRecordForBatch(record, forceRetry), settlementExecutor);
                futures.add(future);
            }

            // 等待所有任务完成
            List<RecordProcessResult> results = futures.stream()
                    .map(CompletableFuture::join)
                    .toList();

            // 汇总结果
            for (RecordProcessResult recordResult : results) {
                if (recordResult.isSuccess()) {
                    result.addSuccess(recordResult.getAmount());
                } else {
                    result.addFailure(recordResult.getAmount(), recordResult.getErrorMessage());
                }
            }

        } catch (Exception e) {
            log.error("处理结算批次失败", e);
            result.addFailure(BigDecimal.ZERO, "批次处理异常: " + e.getMessage());
        } finally {
            result.setProcessTime(System.currentTimeMillis() - startTime);
        }

        return result;
    }

    /**
     * 单条记录处理结果
     */
    private RecordProcessResult processSingleRecordForBatch(JointMarketingRebateRecord record, Boolean forceRetry) {
        RecordProcessResult result = new RecordProcessResult();
        result.setAmount(record.getAmount());

        try {
            // 检查重试条件
            if (!Boolean.TRUE.equals(forceRetry) &&
                    record.getRetryCount() != null && record.getRetryCount() >= 3) {
                result.setSuccess(false);
                result.setErrorMessage("重试次数已达上限");
                return result;
            }

            // 执行转账
            boolean transferSuccess = executeTransferWithTimeout(record);

            if (transferSuccess) {
                // 更新记录状态为已结算
                record.setStatus("SETTLED");
                record.setSettledTime(LocalDateTime.now());
                record.setFailureReason("");
                record.setRetryCount(0);
                result.setSuccess(true);
            } else {
                // 更新失败状态
                record.setStatus("SETTLEMENT_FAILED");
                record.setRetryCount(record.getRetryCount() == null ? 1 : record.getRetryCount() + 1);
                result.setSuccess(false);
                result.setErrorMessage("转账失败");
            }

            // 更新数据库
            boolean updateSuccess = rebateRecordMapper.updateById(record) > 0;
            if (!updateSuccess) {
                result.setSuccess(false);
                result.setErrorMessage("更新记录状态失败");
            }

        } catch (Exception e) {
            log.error("处理结算记录失败, ID: {}", record.getId(), e);
            result.setSuccess(false);
            result.setErrorMessage("处理异常: " + e.getMessage());
        }

        return result;
    }

    /**
     * 同步处理单条记录(用于重试)
     */
    private boolean processSingleRecordWithRetrySync(JointMarketingRebateRecord record) {
        String recordLockKey = "settlement_record_lock_" + record.getId();
        RLock recordLock = redissonClient.getLock(recordLockKey);

        try {
            if (!recordLock.tryLock(5, 30, TimeUnit.SECONDS)) {
                log.warn("记录正在被其他线程处理, ID: {}", record.getId());
                return false;
            }

            // 重新查询记录状态
            JointMarketingRebateRecord freshRecord = rebateRecordMapper.selectById(record.getId());
            if (freshRecord == null || !freshRecord.getStatus().equals(record.getStatus())) {
                log.info("记录状态已变更, 跳过处理, ID: {}", record.getId());
                return false;
            }

            // 执行转账
            boolean transferSuccess = executeTransferWithTimeout(freshRecord);

            // 更新状态
            TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
            return Boolean.TRUE.equals(transactionTemplate.execute(status -> {
                if (transferSuccess) {
                    freshRecord.setStatus("SETTLED");
                    freshRecord.setSettledTime(LocalDateTime.now());
                    freshRecord.setFailureReason("");
                    freshRecord.setRetryCount(0);
                } else {
                    freshRecord.setStatus("SETTLEMENT_FAILED");
                    freshRecord.setRetryCount(freshRecord.getRetryCount() == null ? 1 : freshRecord.getRetryCount() + 1);
                }

                return rebateRecordMapper.updateById(freshRecord) > 0;
            }));

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("记录处理被中断, ID: {}", record.getId(), e);
            return false;
        } catch (Exception e) {
            log.error("记录处理失败, ID: {}", record.getId(), e);
            return false;
        } finally {
            if (recordLock.isHeldByCurrentThread()) {
                recordLock.unlock();
            }
        }
    }

}