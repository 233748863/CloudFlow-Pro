package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;
import com.cloudflow.oa.domain.dto.RecentTaskDTO;
import com.cloudflow.oa.service.IWorkplaceService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.ISysScheduleService;
import com.cloudflow.oa.service.IWorkflowService;
import com.cloudflow.oa.service.ISysAnnouncementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 工作台服务实现
 */
@Service
public class WorkplaceServiceImpl implements IWorkplaceService {
    
    @Autowired
    private IWorkflowService workflowService;
    
    @Autowired
    private ISysScheduleService scheduleService;
    
    @Autowired
    private ISysNoticeService noticeService;
    
    @Autowired
    private ISysAnnouncementService announcementService;
    
    @Override
    public WorkplaceSummaryDTO getWorkplaceSummary(Long userId) {
        WorkplaceSummaryDTO summary = new WorkplaceSummaryDTO();
        
        // 1. 用户信息 (TODO: 从用户服务获取)
        WorkplaceSummaryDTO.UserInfo userInfo = new WorkplaceSummaryDTO.UserInfo();
        userInfo.setName("用户" + userId);
        userInfo.setDepartment("技术部");
        userInfo.setAvatar("");
        summary.setUser(userInfo);
        
        // 2. 统计数据
        WorkplaceSummaryDTO.Statistics statistics = new WorkplaceSummaryDTO.Statistics();
        
        // 待办任务数量 (TODO: 从工作流服务获取)
        statistics.setPendingTasks(0);
        
        // 今日日程数量
        LocalDate today = LocalDate.now();
        String todayStr = today.format(DateTimeFormatter.ISO_LOCAL_DATE);
        // TODO: 调用 scheduleService 获取今日日程数量
        statistics.setTodaySchedules(0);
        
        // 未读消息数量
        long unreadCount = noticeService.getUnreadCount(userId);
        statistics.setUnreadMessages((int) unreadCount);
        
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
        // TODO: 从公告服务获取最新公告
        summary.setAnnouncements(new ArrayList<>());
        
        return summary;
    }
    
    @Override
    public List<RecentTaskDTO> getRecentTasks(Long userId, Integer limit) {
        // TODO: 从工作流服务获取最近任务
        // 这里返回空列表，需要在工作流服务中实现获取最近任务的方法
        return new ArrayList<>();
    }
}
