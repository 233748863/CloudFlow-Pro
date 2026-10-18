package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import com.cloudflow.crm.domain.CrmActivityReminder;
import com.cloudflow.crm.mapper.CrmActivityMapper;
import com.cloudflow.crm.mapper.CrmActivityParticipantMapper;
import com.cloudflow.crm.mapper.CrmActivityReminderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmActivityReminderService {
    private final CrmActivityMapper activityMapper;
    private final CrmActivityParticipantMapper participantMapper;
    private final CrmActivityReminderMapper reminderMapper;
    private final MessageSender messageSender;
    private final TransactionTemplate transactionTemplate;

    public int dispatch() {
        int count = 0;
        for (Long id : activityMapper.selectPendingReminderActivities(LocalDateTime.now())) {
            Integer sent = transactionTemplate.execute(status -> dispatchLocked(id));
            count += sent == null ? 0 : sent;
        }
        return count;
    }

    private int dispatchLocked(Long id) {
        CrmActivity activity = activityMapper.lockById(id);
        if (activity == null || !Set.of("PLANNED", "IN_PROGRESS").contains(activity.getStatus())) return 0;
        Set<Long> userIds = new LinkedHashSet<>();
        if (activity.getOwnerId() != null) userIds.add(activity.getOwnerId());
        participantMapper.selectList(new LambdaQueryWrapper<CrmActivityParticipant>()
                .eq(CrmActivityParticipant::getActivityId, id).eq(CrmActivityParticipant::getParticipantType, "USER")
                .ne(CrmActivityParticipant::getAcceptanceStatus, "DECLINED"))
                .forEach(participant -> userIds.add(participant.getParticipantRefId()));
        if (userIds.isEmpty()) return 0;
        List<CrmActivityReminder> reminders = reminderMapper.selectList(new LambdaQueryWrapper<CrmActivityReminder>()
                .eq(CrmActivityReminder::getActivityId, id).eq(CrmActivityReminder::getSentFlag, 0));
        int count = 0;
        LocalDateTime now = LocalDateTime.now();
        for (CrmActivityReminder reminder : reminders) {
            if (activity.getStartTime().minusMinutes(reminder.getRemindMinutesBefore()).isAfter(now)) continue;
            messageSender.send(MessageSendRequest.builder().templateCode("CRM_ACTIVITY_REMINDER")
                    .channelTypes(List.of(MessageChannelType.valueOf(reminder.getChannelType())))
                    .receivers(userIds.stream().map(MessageReceiver::ofUser).toList()).category(MessageCategory.BIZ_REMINDER)
                    .bizType("CRM_ACTIVITY").bizId(String.valueOf(id))
                    .deduplicationKey("activity:" + id + ":reminder:" + reminder.getReminderId())
                    .params(java.util.Map.of("title", "活动提醒：" + activity.getSubject(), "content", "开始时间：" + activity.getStartTime()
                            + "；地点：" + (activity.getLocation() == null ? "未设置" : activity.getLocation())))
                    .title("活动提醒：" + activity.getSubject()).content("开始时间：" + activity.getStartTime()
                            + "；地点：" + (activity.getLocation() == null ? "未设置" : activity.getLocation()))
                    .linkUrl("/office/crm/activity?activityId=" + id).build());
            reminder.setSentFlag(1); reminder.setSendTime(now); CrmRecordSupport.touch(reminder);
            CrmRecordSupport.saved(reminderMapper.updateById(reminder));
            count++;
        }
        return count;
    }

    public int markOverdue() {
        return activityMapper.update(null, new LambdaUpdateWrapper<CrmActivity>()
                .eq(CrmActivity::getActivityType, "TASK").in(CrmActivity::getStatus, "PLANNED", "IN_PROGRESS")
                .lt(CrmActivity::getEndTime, LocalDateTime.now()).eq(CrmActivity::getOverdueFlag, 0)
                .set(CrmActivity::getOverdueFlag, 1).set(CrmActivity::getUpdateBy, "system")
                .set(CrmActivity::getUpdateTime, LocalDateTime.now()));
    }
}
