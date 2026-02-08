package com.cloudflow.oa.service.impl;

import com.cloudflow.common.security.utils.SecurityUtils;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;
import com.cloudflow.oa.domain.dto.RecentTaskDTO;
import com.cloudflow.oa.service.IWorkplaceService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.ISysScheduleService;
import com.cloudflow.oa.service.ISysAnnouncementService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 工作台服务实现
 */
@Slf4j
@Service
public class WorkplaceServiceImpl implements IWorkplaceService {
    
    @Autowired
    private RemoteWorkflowService remoteWorkflowService;
    
    @Autowired
    private ISysScheduleService scheduleService;
    
    @Autowired
    private ISysNoticeService noticeService;
    
    @Autowired
    private ISysAnnouncementService announcementService;
    
    @Override
    public WorkplaceSummaryDTO getWorkplaceSummary(Long userId) {
        WorkplaceSummaryDTO summary = new WorkplaceSummaryDTO();
        
        try {
            // 1. 用户信息 (从SecurityUtils获取当前用户信息)
            WorkplaceSummaryDTO.UserInfo userInfo = new WorkplaceSummaryDTO.UserInfo();
            try {
                String username = SecurityUtils.getUsername();
                userInfo.setName(username != null ? username : "用户" + userId);
            } catch (Exception e) {
                log.warn("获取用户名失败，使用默认值", e);
                userInfo.setName("用户" + userId);
            }
            userInfo.setDepartment(""); // 部门信息需要从用户服务获取，暂时留空
            userInfo.setAvatar(""); // 头像信息需要从用户服务获取，暂时留空
            summary.setUser(userInfo);
            
            // 2. 统计数据
            WorkplaceSummaryDTO.Statistics statistics = new WorkplaceSummaryDTO.Statistics();
            
            // 待办任务数量 (通过远程工作流服务获取)
            try {
                // 注意：这里需要工作流服务提供待办任务统计接口
                // 暂时设置为0，实际应该调用 remoteWorkflowService 的统计接口
                statistics.setPendingTasks(0);
                log.debug("待办任务数量获取成功");
            } catch (Exception e) {
                log.warn("获取待办任务数量失败", e);
                statistics.setPendingTasks(0);
            }
            
            // 今日日程数量
            LocalDate today = LocalDate.now();
            String todayStr = today.format(DateTimeFormatter.ISO_LOCAL_DATE);
            try {
                List<SysScheduleEvent> todayEvents = scheduleService.getMyEvents(
                    userId, 
                    todayStr, 
                    todayStr
                );
                statistics.setTodaySchedules(todayEvents != null ? todayEvents.size() : 0);
                log.debug("今日日程数量: {}", statistics.getTodaySchedules());
            } catch (Exception e) {
                log.warn("获取今日日程数量失败", e);
                statistics.setTodaySchedules(0);
            }
            
            // 未读消息数量
            try {
                long unreadCount = noticeService.getUnreadCount(userId);
                statistics.setUnreadMessages((int) unreadCount);
                log.debug("未读消息数量: {}", statistics.getUnreadMessages());
            } catch (Exception e) {
                log.warn("获取未读消息数量失败", e);
                statistics.setUnreadMessages(0);
            }
            
            summary.setStatistics(statistics);
        
        // 3. 快捷操作
        List<WorkplaceSummaryDTO.QuickAction> quickActions = new ArrayList<>();
        
        WorkplaceSummaryDTO.QuickAction vehicleAction = new WorkplaceSummaryDTO.QuickAction();
        vehicleAction.setId("vehicle");
        vehicleAction.setName("用车申请");
        vehicleAction.setIcon("car");
        vehicleAction.setColor("blue");
        vehicleAction.setPath("/vehicle/booking");
        quickActions.add(vehicleAction);
        
        WorkplaceSummaryDTO.QuickAction leaveAction = new WorkplaceSummaryDTO.QuickAction();
        leaveAction.setId("leave");
        leaveAction.setName("请假申请");
        leaveAction.setIcon("calendar");
        leaveAction.setColor("green");
        leaveAction.setPath("/leave/apply");
        quickActions.add(leaveAction);
        
        WorkplaceSummaryDTO.QuickAction expenseAction = new WorkplaceSummaryDTO.QuickAction();
        expenseAction.setId("expense");
        expenseAction.setName("报销申请");
        expenseAction.setIcon("dollar");
        expenseAction.setColor("orange");
        expenseAction.setPath("/expense/apply");
        quickActions.add(expenseAction);
        
        WorkplaceSummaryDTO.QuickAction meetingAction = new WorkplaceSummaryDTO.QuickAction();
        meetingAction.setId("meeting");
        meetingAction.setName("会议室预订");
        meetingAction.setIcon("users");
        meetingAction.setColor("purple");
        meetingAction.setPath("/meeting/booking");
        quickActions.add(meetingAction);
        
        summary.setQuickActions(quickActions);
        
            // 4. 最新公告 (最多3条)
            try {
                List<SysAnnouncement> allAnnouncements = announcementService.getMyAnnouncements(userId);
                List<WorkplaceSummaryDTO.AnnouncementItem> announcements = new ArrayList<>();
                
                if (allAnnouncements != null && !allAnnouncements.isEmpty()) {
                    // 取最新的3条公告
                    announcements = allAnnouncements.stream()
                        .limit(3)
                        .map(announcement -> {
                            WorkplaceSummaryDTO.AnnouncementItem dto = new WorkplaceSummaryDTO.AnnouncementItem();
                            dto.setId(announcement.getAnnouncementId());
                            dto.setTitle(announcement.getTitle());
                            dto.setPublishTime(announcement.getCreateTime() != null 
                                ? announcement.getCreateTime().toString() 
                                : null);
                            dto.setIsRead(announcement.isRead());
                            return dto;
                        })
                        .collect(Collectors.toList());
                }
                summary.setAnnouncements(announcements);
                log.debug("获取最新公告数量: {}", announcements.size());
            } catch (Exception e) {
                log.warn("获取最新公告失败", e);
                summary.setAnnouncements(new ArrayList<>());
            }
            
        } catch (Exception e) {
            log.error("获取工作台概览失败", e);
            // 返回空数据而不是抛出异常，确保前端能正常显示
            summary.setUser(new WorkplaceSummaryDTO.UserInfo());
            summary.setStatistics(new WorkplaceSummaryDTO.Statistics());
            summary.setQuickActions(new ArrayList<>());
            summary.setAnnouncements(new ArrayList<>());
        }
        
        return summary;
    }
    
    @Override
    public List<RecentTaskDTO> getRecentTasks(Long userId, Integer limit) {
        try {
            // 注意：这里需要工作流服务提供最近任务查询接口
            // 暂时返回空列表，实际应该调用 remoteWorkflowService 的最近任务接口
            log.debug("获取最近任务，用户ID: {}, 限制数量: {}", userId, limit);
            
            // TODO: 实际实现应该类似：
            // return remoteWorkflowService.getRecentTasks(userId, limit);
            
            return new ArrayList<>();
        } catch (Exception e) {
            log.error("获取最近任务失败", e);
            return new ArrayList<>();
        }
    }
}
