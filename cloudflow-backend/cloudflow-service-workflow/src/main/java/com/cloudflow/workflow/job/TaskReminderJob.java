package com.cloudflow.workflow.job;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;

import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 任务到期提醒定时任务
 *
 * 功能说明：
 * 当流程任务分配给某人时，系统会立即发送一次通知（已有逻辑）。
 * 如果任务配置了 SLA（超时时间），本 Job 会在到期前 1 小时、30 分钟、10 分钟
 * 各发送一次催办提醒通知，帮助处理人及时完成任务。
 *
 * 实现原理：
 * - 任务创建时，在 Redis ZSet（sys:task:reminders）中注册多条提醒条目，
 *   score 为提醒触发时间戳，value 为 "taskId:minutesBefore" 格式。
 * - 本 Job 由平台默认每 5 分钟扫描各租户 ZSet，取出所有 score <= 当前时间的条目，
 *   校验任务仍在待办状态后发送提醒通知。
 * - 使用分布式锁防止多实例重复执行。
 *
 * @author CloudFlow
 */
@Component
public class TaskReminderJob {

    private static final Logger log = LoggerFactory.getLogger(TaskReminderJob.class);

    /** Redis ZSet Key：存储所有待触发的提醒条目 */
    public static final String REMINDER_ZSET_KEY = "sys:task:reminders";

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private com.cloudflow.common.message.api.MessageSender sysNoticeService;

    @Autowired
    private TenantIterator tenantIterator;

    @Autowired
    private TransactionTemplate transactionTemplate;

    /** 平台默认每5分钟扫描；每租户读取自身提醒索引，失败条目留待重试。 */
    @DistributedJob(name = "task-reminder-job", lockTime = 25)
    @JobHandler(value = "taskReminder", desc = "任务催办扫描")
    public JobResult scanTaskReminders() {
        RLock lock = redissonClient.getLock("lock:scheduled:scanTaskReminders");
        boolean acquired = false;
        try {
            acquired = lock.tryLock(1, 25, TimeUnit.SECONDS);
            if (!acquired) {
                return JobResult.builder().executeStatus("SKIPPED").affectedRows(0)
                        .resultMsg("催办扫描已有任务执行，已跳过").build();
            }
            AtomicInteger submitted = new AtomicInteger();
            List<RuntimeException> failures = new ArrayList<>();
            tenantIterator.forEachActiveTenant(tenantId -> {
                try {
                    submitted.addAndGet(scanTenantReminders(tenantId, failures));
                } catch (RuntimeException exception) {
                    failures.add(new IllegalStateException("催办队列读取失败，租户：" + tenantId, exception));
                }
            });
            if (!failures.isEmpty()) {
                IllegalStateException failure = new IllegalStateException("催办扫描存在失败项：" + failures.size() + "项");
                failures.forEach(failure::addSuppressed);
                throw failure;
            }
            return JobResult.success(submitted.get(), "催办扫描完成：已提交" + submitted.get() + "条提醒请求");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("催办扫描获取锁被中断", exception);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    private int scanTenantReminders(Long tenantId, List<RuntimeException> failures) {
        Set<Object> dueReminders = redisCache.getCacheZSetByScoreRange(
                REMINDER_ZSET_KEY, 0, (double) System.currentTimeMillis());
        if (dueReminders == null || dueReminders.isEmpty()) return 0;
        int submitted = 0;
        for (Object reminder : dueReminders) {
            String reminderKey = reminder.toString();
            try {
                int count = handleReminder(reminderKey);
                // 数据库消息事件提交后才移除；移除失败时稳定消息身份避免重试重复发送。
                redisCache.removeCacheZSet(REMINDER_ZSET_KEY, reminder);
                submitted += count;
            } catch (RuntimeException exception) {
                log.error("催办提醒处理失败，保留待处理项, tenantId={}, key={}", tenantId, reminderKey, exception);
                failures.add(new IllegalStateException("催办提醒失败，租户：" + tenantId + "，条目：" + reminderKey, exception));
            }
        }
        return submitted;
    }

    /** 格式为taskId:minutesBefore；格式损坏或已无需提醒的条目可正常移除。 */
    private int handleReminder(String reminderKey) {
        int lastColon = reminderKey.lastIndexOf(':');
        if (lastColon <= 0) {
            log.warn("催办提醒Key格式无效: {}", reminderKey);
            return 0;
        }
        String taskId = reminderKey.substring(0, lastColon);
        int minutesBefore;
        try {
            minutesBefore = Integer.parseInt(reminderKey.substring(lastColon + 1));
        } catch (NumberFormatException exception) {
            log.warn("催办提醒Key分钟数无效: {}", reminderKey);
            return 0;
        }
        if (minutesBefore <= 0) return 0;
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) throw new IllegalStateException("催办扫描缺少租户上下文");
        Integer submitted = transactionTemplate.execute(status -> {
            WfTask task = taskMapper.selectForUpdate(tenantId, taskId);
            if (task == null || !WfTaskStatus.TODO.getCode().equals(task.getStatus()) || task.getAssignee() == null) return 0;
            WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
            String processTitle = instance == null || instance.getTitle() == null ? "未知流程" : instance.getTitle();
            String nodeName = task.getNodeName() == null ? "待办任务" : task.getNodeName();
            String reference = taskId + ":" + minutesBefore + ":" + task.getDueTime();
            String title = "⏰ 任务即将到期提醒";
            String content = String.format("您的待办任务「%s」（流程: %s）将在 %s 后到期，请尽快处理！",
                    nodeName, processTitle, formatMinutes(minutesBefore));
            sysNoticeService.send(MessageSendRequest.builder().templateCode("WF_TASK_URGE")
                    .channelTypes(List.of(MessageChannelType.INTERNAL)).category(MessageCategory.TODO)
                    .receivers(List.of(MessageReceiver.ofUser(task.getAssignee())))
                    .bizType("WF_TASK_URGE").bizId(reference)
                    .deduplicationKey("wf:task:urge:" + reference + ":" + task.getAssignee())
                    .params(Map.of("processTitle", processTitle, "nodeName", nodeName, "taskId", taskId))
                    .title(title).content(content).build());
            return 1;
        });
        return submitted == null ? 0 : submitted;
    }

    /**
     * 将分钟数格式化为可读的时间描述
     */
    private String formatMinutes(int minutes) {
        if (minutes >= 60) {
            int hours = minutes / 60;
            int remainMinutes = minutes % 60;
            if (remainMinutes > 0) {
                return hours + " 小时 " + remainMinutes + " 分钟";
            }
            return hours + " 小时";
        }
        return minutes + " 分钟";
    }

    /**
     * 注册任务到期提醒（供外部调用）
     *
     * 在任务创建时调用此方法，根据 SLA 超时时间注册多个提醒时间点：
     * - 到期前 60 分钟
     * - 到期前 30 分钟
     * - 到期前 10 分钟
     *
     * 如果 SLA 时间不足以覆盖某个提醒点（例如 SLA 只有 20 分钟），
     * 则跳过该提醒点，只注册在 SLA 范围内的提醒。
     *
     * @param taskId     任务ID
     * @param slaHours   SLA 超时时间（小时）
     */
    public void registerAfterCommit(String taskId, Integer slaHours) {
        if (taskId == null || slaHours == null || slaHours <= 0) return;
        long expiresAt = System.currentTimeMillis() + slaHours * 3600L * 1000L;
        afterCommit(taskId, () -> {
            redisCache.setCacheZSet("sys:task:timeouts", taskId, (double) expiresAt);
            registerReminders(taskId, slaHours);
        });
    }

    public void cancelAfterCommit(String taskId) {
        if (taskId != null) afterCommit(taskId, () -> cancelReminders(taskId));
    }

    private void afterCommit(String taskId, Runnable operation) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            operation.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try { operation.run(); }
                catch (RuntimeException failure) { log.warn("任务提醒索引提交后更新失败, taskId={}", taskId, failure); }
            }
        });
    }

    public void registerReminders(String taskId, Integer slaHours) {
        if (taskId == null || slaHours == null || slaHours <= 0) {
            return;
        }

        long now = System.currentTimeMillis();
        long deadlineMs = now + slaHours * 3600L * 1000L;
        long slaMinutes = slaHours * 60L;

        // 提醒时间点（到期前 N 分钟）
        int[] reminderMinutes = {60, 30, 10};

        for (int minutesBefore : reminderMinutes) {
            // 只有 SLA 时间大于提醒时间点才注册（例如 SLA 20 分钟就不注册 60 分钟提醒）
            if (slaMinutes > minutesBefore) {
                long triggerTime = deadlineMs - minutesBefore * 60L * 1000L;
                // 确保触发时间在未来
                if (triggerTime > now) {
                    String reminderKey = taskId + ":" + minutesBefore;
                    redisCache.setCacheZSet(REMINDER_ZSET_KEY, reminderKey, (double) triggerTime);
                    log.debug("[TaskReminderJob] 注册到期提醒, taskId={}, minutesBefore={}, triggerTime={}",
                            taskId, minutesBefore, new java.util.Date(triggerTime));
                }
            }
        }

        log.info("[TaskReminderJob] 任务到期提醒注册完成, taskId={}, slaHours={}", taskId, slaHours);
    }

    /**
     * 取消任务的所有到期提醒（任务完成或删除时调用）
     *
     * @param taskId 任务ID
     */
    public void cancelReminders(String taskId) {
        if (taskId == null) return;

        redisCache.removeCacheZSet("sys:task:timeouts", taskId);

        int[] reminderMinutes = {60, 30, 10};
        for (int minutesBefore : reminderMinutes) {
            String reminderKey = taskId + ":" + minutesBefore;
            redisCache.removeCacheZSet(REMINDER_ZSET_KEY, reminderKey);
        }

        log.debug("[TaskReminderJob] 任务到期提醒已取消, taskId={}", taskId);
    }
}
