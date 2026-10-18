package com.cloudflow.auth.service;

import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.support.TenantIterator;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 每年提醒各活跃租户的管理员和人事维护次年日历。 */
@Service
@RequiredArgsConstructor
public class HolidayYearlyReminderService {
    private final TenantIterator tenants;
    private final SysUserMapper users;
    private final MessageSender messages;

    public JobResult remind() {
        int targetYear = LocalDate.now().getYear() + 1;
        AtomicInteger submitted = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        for (Long tenantId : tenants.listActiveTenantIds()) {
            try {
                TenantBroker.runAs(tenantId, current -> {
                    long afterUserId = 0;
                    while (true) {
                        List<Long> recipients = users.selectHolidayReminderUserIds(current, afterUserId, 500);
                        if (recipients.isEmpty()) break;
                        for (Long userId : recipients) {
                            messages.send(MessageSendRequest.builder()
                                    .channelTypes(List.of(MessageChannelType.INTERNAL))
                                    .receivers(List.of(MessageReceiver.ofUser(userId)))
                                    .category(MessageCategory.SYSTEM)
                                    .bizType("SYS_HOLIDAY_YEARLY_REMIND")
                                    .bizId(String.valueOf(targetYear))
                                    .deduplicationKey("holiday-yearly:" + targetYear + ":" + userId)
                                    .linkUrl("/holiday")
                                    .title("请维护" + targetYear + "年节假日日历")
                                    .content("请根据正式公布的节假日安排，核对并维护" + targetYear
                                            + "年的节假日和调休工作日，确保考勤、请假及业务期限计算准确。")
                                    .build());
                            submitted.incrementAndGet();
                        }
                        afterUserId = recipients.get(recipients.size() - 1);
                    }
                });
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("年度节假日维护提醒失败，租户：" + tenantId, exception));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("年度节假日维护提醒存在失败租户："
                    + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        // 统计通过消息入口提交的收件人；实际送达、订阅和重试结果由消息中心记录。
        return JobResult.success(submitted.get(), "年度节假日维护提醒扫描完成：目标年份" + targetYear
                + "，已提交收件人" + submitted.get() + "名");
    }
}
