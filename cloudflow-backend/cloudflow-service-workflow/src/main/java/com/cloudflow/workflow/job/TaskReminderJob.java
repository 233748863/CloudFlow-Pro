package com.cloudflow.workflow.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.TenantBroker;
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
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

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
 * - 本 Job 每 30 秒扫描一次 ZSet，取出所有 score <= 当前时间的条目，
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
    private com.cloudflow.workflow.service.ISysNoticeService sysNoticeService;

    /**
     * 每 30 秒扫描一次到期提醒
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "task-reminder-job", lockTime = 25)
    @Scheduled(fixedRate = 30000)
    public void scanTaskReminders() {
        String lockKey = "lock:scheduled:scanTaskReminders";
        RLock lock = redissonClient.getLock(lockKey);

        try {
            // 尝试获取锁，最多等待 1 秒，锁定 25 秒后自动释放
            if (lock.tryLock(1, 25, TimeUnit.SECONDS)) {
                try {
                    long now = System.currentTimeMillis();

                    // 从 Redis ZSet 中获取所有已到触发时间的提醒条目（score <= 当前时间）
                    Set<Object> dueReminders = redisCache.getCacheZSetByScoreRange(
                            REMINDER_ZSET_KEY, 0, (double) now);

                    if (dueReminders == null || dueReminders.isEmpty()) {
                        return;
                    }

                    log.info("[TaskReminderJob] 发现 {} 条到期提醒", dueReminders.size());

                    for (Object reminderObj : dueReminders) {
                        String reminderKey = reminderObj.toString();
                        try {
                            handleReminder(reminderKey);
                        } catch (Exception e) {
                            log.error("[TaskReminderJob] 处理提醒失败, key={}, error={}",
                                    reminderKey, e.getMessage(), e);
                        }

                        // 无论处理成功与否，都从 ZSet 中移除，避免重复触发
                        redisCache.removeCacheZSet(REMINDER_ZSET_KEY, reminderKey);
                    }
                } finally {
                    lock.unlock();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[TaskReminderJob] 获取分布式锁被中断");
        } catch (Exception e) {
            log.error("[TaskReminderJob] 扫描到期提醒异常: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理单条提醒
     *
     * @param reminderKey 格式为 "taskId:minutesBefore"，例如 "abc123:60" 表示到期前 60 分钟提醒
     */
    private void handleReminder(String reminderKey) {
        // 解析 reminderKey
        int lastColon = reminderKey.lastIndexOf(':');
        if (lastColon <= 0) {
            log.warn("[TaskReminderJob] 提醒Key格式无效: {}", reminderKey);
            return;
        }

        String taskId = reminderKey.substring(0, lastColon);
        String minutesStr = reminderKey.substring(lastColon + 1);
        int minutesBefore;
        try {
            minutesBefore = Integer.parseInt(minutesStr);
        } catch (NumberFormatException e) {
            log.warn("[TaskReminderJob] 提醒Key中的分钟数无效: {}", reminderKey);
            return;
        }

        // 查询任务是否仍在待办状态：Job 线程无 HTTP 上下文，跨租户读 task 拿 tenantId，
        // 再用 broker 包后续提醒发送，确保 SysNotice insert 走对租户。
        WfTask task = TenantBroker.applyWithoutTenant(v -> taskMapper.selectById(taskId));
        if (task == null) {
            log.debug("[TaskReminderJob] 任务已不存在（可能已完成），跳过提醒, taskId={}", taskId);
            return;
        }

        if (!WfTaskStatus.TODO.getCode().equals(task.getStatus())) {
            log.debug("[TaskReminderJob] 任务已被处理，跳过提醒, taskId={}, status={}", taskId, task.getStatus());
            return;
        }

        if (task.getAssignee() == null) {
            log.debug("[TaskReminderJob] 任务无处理人，跳过提醒, taskId={}", taskId);
            return;
        }

        int minutesBeforeFinal = minutesBefore;
        TenantBroker.runAs(task.getTenantId(), tid -> {
            // 查询流程实例，获取流程标题
            String processTitle = "未知流程";
            WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
            if (instance != null) {
                processTitle = instance.getTitle();
            }

            // 构建提醒内容
            String timeDesc = formatMinutes(minutesBeforeFinal);
            String title = "⏰ 任务即将到期提醒";
            String content = String.format(
                    "您的待办任务「%s」（流程: %s）将在 %s 后到期，请尽快处理！",
                    task.getNodeName(), processTitle, timeDesc);

            // 发送通知
            sysNoticeService.sendNotice(
                    task.getAssignee(),
                    title,
                    content,
                    "2", // 类型 2 = 提醒
                    0L,  // 系统发送
                    "系统"
            );

            log.info("[TaskReminderJob] 到期提醒已发送, taskId={}, assignee={}, minutesBefore={}, tenantId={}",
                    taskId, task.getAssignee(), minutesBeforeFinal, tid);
        });
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

        int[] reminderMinutes = {60, 30, 10};
        for (int minutesBefore : reminderMinutes) {
            String reminderKey = taskId + ":" + minutesBefore;
            redisCache.removeCacheZSet(REMINDER_ZSET_KEY, reminderKey);
        }

        log.debug("[TaskReminderJob] 任务到期提醒已取消, taskId={}", taskId);
    }
}
