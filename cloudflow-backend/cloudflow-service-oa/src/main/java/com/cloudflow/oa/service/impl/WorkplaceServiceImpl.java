package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;
import com.cloudflow.oa.service.ISysAnnouncementService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.ISysScheduleService;
import com.cloudflow.oa.service.IWorkplaceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkplaceServiceImpl implements IWorkplaceService {

    private final ISysScheduleService scheduleService;
    private final ISysNoticeService noticeService;
    private final ISysAnnouncementService announcementService;

    @Override
    public WorkplaceSummaryDTO getWorkplaceSummary(Long userId) {
        WorkplaceSummaryDTO summary = new WorkplaceSummaryDTO();
        summary.setUser(buildUserInfo(userId));
        summary.setStatistics(buildStatistics(userId));
        summary.setQuickActions(buildQuickActions());
        summary.setAnnouncements(loadAnnouncements(userId));
        return summary;
    }

    private WorkplaceSummaryDTO.UserInfo buildUserInfo(Long userId) {
        WorkplaceSummaryDTO.UserInfo userInfo = new WorkplaceSummaryDTO.UserInfo();
        try {
            String username = SecurityUtils.getUsername();
            userInfo.setName(username != null ? username : "user-" + userId);
        } catch (Exception e) {
            userInfo.setName("user-" + userId);
        }
        userInfo.setDepartment("");
        userInfo.setAvatar("");
        return userInfo;
    }

    private WorkplaceSummaryDTO.Statistics buildStatistics(Long userId) {
        WorkplaceSummaryDTO.Statistics statistics = new WorkplaceSummaryDTO.Statistics();
        statistics.setPendingTasks(0);

        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        try {
            List<SysScheduleEvent> todayEvents = scheduleService.getMyEvents(userId, today, today);
            statistics.setTodaySchedules(todayEvents != null ? todayEvents.size() : 0);
        } catch (Exception e) {
            log.warn("load today schedules failed", e);
            statistics.setTodaySchedules(0);
        }

        try {
            statistics.setUnreadMessages((int) noticeService.getUnreadCount(userId));
        } catch (Exception e) {
            log.warn("load unread notices failed", e);
            statistics.setUnreadMessages(0);
        }

        return statistics;
    }

    private List<WorkplaceSummaryDTO.QuickAction> buildQuickActions() {
        List<WorkplaceSummaryDTO.QuickAction> actions = new ArrayList<>();
        actions.add(action("leave", "休假登记", "calendar", "green", "/leave-application"));
        actions.add(action("overtime", "加班登记", "clock", "blue", "/overtime-application"));
        actions.add(action("schedule", "我的日程", "calendar-days", "purple", "/schedule"));
        actions.add(action("contact", "通讯录", "users", "slate", "/contact"));
        return actions;
    }

    private WorkplaceSummaryDTO.QuickAction action(String id, String name, String icon, String color, String path) {
        WorkplaceSummaryDTO.QuickAction action = new WorkplaceSummaryDTO.QuickAction();
        action.setId(id);
        action.setName(name);
        action.setIcon(icon);
        action.setColor(color);
        action.setPath(path);
        return action;
    }

    private List<WorkplaceSummaryDTO.AnnouncementItem> loadAnnouncements(Long userId) {
        try {
            List<SysAnnouncement> announcements = announcementService.getMyAnnouncements(userId);
            if (announcements == null) {
                return new ArrayList<>();
            }
            return announcements.stream()
                    .limit(3)
                    .map(this::toAnnouncementItem)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("load announcements failed", e);
            return new ArrayList<>();
        }
    }

    private WorkplaceSummaryDTO.AnnouncementItem toAnnouncementItem(SysAnnouncement announcement) {
        WorkplaceSummaryDTO.AnnouncementItem item = new WorkplaceSummaryDTO.AnnouncementItem();
        item.setId(announcement.getAnnouncementId());
        item.setTitle(announcement.getTitle());
        item.setPublishTime(announcement.getCreateTime() != null ? announcement.getCreateTime().toString() : null);
        item.setIsRead(Boolean.TRUE.equals(announcement.getIsRead()));
        return item;
    }
}
