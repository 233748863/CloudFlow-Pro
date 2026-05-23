package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;
import com.cloudflow.oa.domain.dto.RecentTaskDTO;
import com.cloudflow.oa.service.IOaContractMilestoneService;
import com.cloudflow.oa.service.IOaRiskAlertService;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.IWorkplaceService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.ISysScheduleService;
import com.cloudflow.oa.service.ISysAnnouncementService;
import com.cloudflow.oa.service.remote.RemoteCrmWorkplaceService;
import com.cloudflow.oa.service.remote.RemoteHrWorkplaceService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaContractConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 工作台服务实现
 * 聚合多个数据源，为前端工作台提供统一的概览数据
 */
@Slf4j
@Service
public class WorkplaceServiceImpl implements IWorkplaceService {

    private static final String WORKPLACE_SUMMARY_CACHE = "oa_workplace_summary#120s";

    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Autowired
    private ISysScheduleService scheduleService;

    @Autowired
    private ISysNoticeService noticeService;

    @Autowired
    private ISysAnnouncementService announcementService;

    @Autowired
    private IOaRiskAlertService riskAlertService;

    @Autowired
    private IOaTraceEventService traceEventService;

    @Autowired
    private RemoteCrmWorkplaceService remoteCrmWorkplaceService;

    @Autowired
    private RemoteHrWorkplaceService remoteHrWorkplaceService;

    @Autowired
    private IOaContractMilestoneService contractMilestoneService;

    @Override
    @Cacheable(cacheNames = WORKPLACE_SUMMARY_CACHE, key = "#userId")
    public WorkplaceSummaryDTO getWorkplaceSummary(Long userId) {
        WorkplaceSummaryDTO summary = new WorkplaceSummaryDTO();
        Map<String, WorkplaceSummaryDTO.ServiceStatus> serviceHealth = new HashMap<>();
        summary.setServiceHealth(serviceHealth);

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
            WorkplaceSummaryDTO.Stats stats = new WorkplaceSummaryDTO.Stats();
            
            // 待办任务数量 - 通过远程工作流服务获取
            try {
                R<Map<String, Integer>> countResult = remoteWorkflowService.getTasksCount();
                if (countResult != null && countResult.getCode() == 200 && countResult.getData() != null) {
                    Map<String, Integer> counts = countResult.getData();
                    // 待办任务 = todo + doing 的总和
                    int todoCount = counts.getOrDefault("todo", 0);
                    int doingCount = counts.getOrDefault("doing", 0);
                    statistics.setPendingTasks(todoCount + doingCount);
                    stats.setPendingTasks(todoCount + doingCount);
                    markService(serviceHealth, "workflow", true, "OK");
                    log.debug("待办任务数量: todo={}, doing={}, 合计={}", todoCount, doingCount, todoCount + doingCount);
                } else {
                    log.warn("获取待办任务数量返回异常，使用默认值0");
                    statistics.setPendingTasks(0);
                    stats.setPendingTasks(0);
                    markService(serviceHealth, "workflow", false, "工作流统计返回异常");
                }
            } catch (Exception e) {
                log.warn("获取待办任务数量失败，使用默认值0", e);
                statistics.setPendingTasks(0);
                stats.setPendingTasks(0);
                markService(serviceHealth, "workflow", false, "工作流服务不可用");
            }
            
            // 今日日程数量
            LocalDate today = LocalDate.now();
            String todayStr = today.format(DateTimeFormatter.ISO_LOCAL_DATE);
            List<SysScheduleEvent> todayEvents = new ArrayList<>();
            try {
                todayEvents = scheduleService.getMyEvents(
                    userId, 
                    todayStr, 
                    todayStr
                );
                statistics.setTodaySchedules(todayEvents != null ? todayEvents.size() : 0);
                stats.setTodaySchedules(todayEvents != null ? todayEvents.size() : 0);
                log.debug("今日日程数量: {}", statistics.getTodaySchedules());
            } catch (Exception e) {
                log.warn("获取今日日程数量失败", e);
                statistics.setTodaySchedules(0);
                stats.setTodaySchedules(0);
                markService(serviceHealth, "oa.schedule", false, "日程服务不可用");
            }
            
            // 未读消息数量
            try {
                long unreadCount = noticeService.getUnreadCount(userId);
                statistics.setUnreadMessages((int) unreadCount);
                stats.setUnreadMessages((int) unreadCount);
                log.debug("未读消息数量: {}", statistics.getUnreadMessages());
            } catch (Exception e) {
                log.warn("获取未读消息数量失败", e);
                statistics.setUnreadMessages(0);
                stats.setUnreadMessages(0);
                markService(serviceHealth, "oa.notice", false, "通知服务不可用");
            }
            
            summary.setStatistics(statistics);
            summary.setStats(stats);
        
            // 3. 快捷操作
            List<WorkplaceSummaryDTO.QuickAction> quickActions = new ArrayList<>();
            
            WorkplaceSummaryDTO.QuickAction vehicleAction = new WorkplaceSummaryDTO.QuickAction();
            vehicleAction.setId("vehicle");
            vehicleAction.setName("用车申请");
            vehicleAction.setIcon("car");
            vehicleAction.setColor("blue");
            vehicleAction.setPath("/vehicle/booking");
            quickActions.add(vehicleAction);
            
            WorkplaceSummaryDTO.QuickAction expenseAction = new WorkplaceSummaryDTO.QuickAction();
            expenseAction.setId("expense");
            expenseAction.setName("报销申请");
            expenseAction.setIcon("dollar");
            expenseAction.setColor("orange");
            expenseAction.setPath("/expense/claim");
            quickActions.add(expenseAction);
            
            WorkplaceSummaryDTO.QuickAction meetingAction = new WorkplaceSummaryDTO.QuickAction();
            meetingAction.setId("meeting");
            meetingAction.setName("会议室预订");
            meetingAction.setIcon("users");
            meetingAction.setColor("purple");
            meetingAction.setPath("/meeting-room");
            quickActions.add(meetingAction);
            
            summary.setQuickActions(quickActions);
        
            // 4. 最新公告 (最多3条)
            List<WorkplaceSummaryDTO.AnnouncementItem> announcements = new ArrayList<>();
            try {
                List<SysAnnouncement> allAnnouncements = announcementService.getMyAnnouncements(userId);
                
                if (allAnnouncements != null && !allAnnouncements.isEmpty()) {
                    announcements = allAnnouncements.stream()
                        .limit(3)
                        .map(announcement -> {
                            WorkplaceSummaryDTO.AnnouncementItem dto = new WorkplaceSummaryDTO.AnnouncementItem();
                            dto.setId(announcement.getAnnouncementId());
                            dto.setTitle(announcement.getTitle());
                            dto.setPublishTime(announcement.getCreateTime() != null 
                                ? announcement.getCreateTime().toString() 
                                : null);
                            dto.setIsRead(announcement.getIsRead() != null && announcement.getIsRead());
                            return dto;
                        })
                        .collect(Collectors.toList());
                    stats.setUnreadAnnouncements((int) allAnnouncements.stream()
                            .filter(announcement -> !Boolean.TRUE.equals(announcement.getIsRead()))
                            .count());
                } else {
                    stats.setUnreadAnnouncements(0);
                }
                summary.setAnnouncements(announcements);
                markService(serviceHealth, "oa.announcement", true, "OK");
                log.debug("获取最新公告数量: {}", announcements.size());
            } catch (Exception e) {
                log.warn("获取最新公告失败", e);
                summary.setAnnouncements(new ArrayList<>());
                stats.setUnreadAnnouncements(0);
                markService(serviceHealth, "oa.announcement", false, "公告服务不可用");
            }

            summary.setTodayItems(buildTodayItems(todayEvents, announcements));
            List<WorkplaceSummaryDTO.TodayItem> crmTodos = loadCrmTodos(serviceHealth);
            summary.setTodayItems(mergeTodayItems(summary.getTodayItems(), crmTodos));
            summary.setRiskItems(loadRiskItems(serviceHealth, stats, userId));
            List<WorkplaceSummaryDTO.ActivityItem> activities = getTimeline(userId, 8);
            stats.setRecentActivities(activities.size());
            summary.setRecentActivities(activities);
            if (!serviceHealth.containsKey("oa")) {
                markService(serviceHealth, "oa", true, "OK");
            }
            
        } catch (Exception e) {
            log.error("获取工作台概览失败", e);
            // 返回空数据而不是抛出异常，确保前端能正常显示
            summary.setUser(new WorkplaceSummaryDTO.UserInfo());
            summary.setStatistics(new WorkplaceSummaryDTO.Statistics());
            summary.setStats(new WorkplaceSummaryDTO.Stats());
            summary.setQuickActions(new ArrayList<>());
            summary.setAnnouncements(new ArrayList<>());
            summary.setTodayItems(new ArrayList<>());
            summary.setRiskItems(new ArrayList<>());
            summary.setRecentActivities(new ArrayList<>());
            markService(serviceHealth, "oa", false, "工作台聚合失败");
        }
        
        return summary;
    }
    
    @Override
    public List<RecentTaskDTO> getRecentTasks(Long userId, Integer limit) {
        try {
            log.debug("获取最近任务，用户ID: {}, 限制数量: {}", userId, limit);
            
            // 通过远程工作流服务获取用户的任务分组数据
            R<Map<String, Object>> groupsResult = remoteWorkflowService.getTaskGroups(userId);
            if (groupsResult != null && groupsResult.getCode() == 200 && groupsResult.getData() != null) {
                Map<String, Object> groupsData = groupsResult.getData();
                List<RecentTaskDTO> recentTasks = new ArrayList<>();
                
                // 从任务分组数据中提取最近任务
                // 工作流服务返回的数据结构可能包含 recentTasks 或 tasks 字段
                Object tasksObj = groupsData.get("recentTasks");
                if (tasksObj == null) {
                    tasksObj = groupsData.get("tasks");
                }
                
                if (tasksObj instanceof List) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> tasksList = (List<Map<String, Object>>) tasksObj;
                    for (Map<String, Object> taskMap : tasksList) {
                        if (recentTasks.size() >= limit) break;
                        
                        RecentTaskDTO dto = new RecentTaskDTO();
                        dto.setTaskId(String.valueOf(taskMap.getOrDefault("taskId", "")));
                        dto.setTaskName(String.valueOf(taskMap.getOrDefault("taskName", "")));
                        dto.setProcessInstanceId(String.valueOf(taskMap.getOrDefault("processInstanceId", "")));
                        dto.setProcessName(String.valueOf(taskMap.getOrDefault("processName", "")));
                        dto.setStatus(String.valueOf(taskMap.getOrDefault("status", "")));
                        dto.setPriority(String.valueOf(taskMap.getOrDefault("priority", "NORMAL")));
                        dto.setDeadline(String.valueOf(taskMap.getOrDefault("deadline", "")));
                        dto.setOperateTime(String.valueOf(taskMap.getOrDefault("operateTime", "")));
                        dto.setApplicant(String.valueOf(taskMap.getOrDefault("applicant", "")));
                        recentTasks.add(dto);
                    }
                }
                
                log.debug("获取到最近任务数量: {}", recentTasks.size());
                return recentTasks;
            }
            
            log.debug("工作流服务未返回有效数据，返回空列表");
            return new ArrayList<>();
        } catch (Exception e) {
            log.error("获取最近任务失败", e);
            return new ArrayList<>();
        }
    }

    @Override
    public List<WorkplaceSummaryDTO.ActivityItem> getTimeline(Long userId, Integer limit) {
        int safeLimit = normalizeLimit(limit, 20);
        try {
            List<WorkplaceSummaryDTO.ActivityItem> oaActivities = traceEventService.listRecent(safeLimit).stream()
                    .map(this::toActivityItem)
                    .collect(Collectors.toList());
            List<WorkplaceSummaryDTO.ActivityItem> crmActivities = loadCrmActivities();
            return mergeActivities(oaActivities, crmActivities, safeLimit);
        } catch (Exception e) {
            log.warn("获取工作台最近动态失败", e);
            return new ArrayList<>();
        }
    }

    private List<WorkplaceSummaryDTO.TodayItem> buildTodayItems(List<SysScheduleEvent> events,
                                                                List<WorkplaceSummaryDTO.AnnouncementItem> announcements) {
        List<WorkplaceSummaryDTO.TodayItem> items = new ArrayList<>();
        if (events != null) {
            for (SysScheduleEvent event : events) {
                WorkplaceSummaryDTO.TodayItem item = new WorkplaceSummaryDTO.TodayItem();
                item.setId("schedule-" + event.getEventId());
                item.setType("SCHEDULE");
                item.setModule("OA");
                item.setSourceLabel("OA 日程");
                item.setTitle(event.getTitle());
                item.setDescription(event.getDescription());
                item.setTime(event.getStartTime() != null ? event.getStartTime().toString() : null);
                item.setStatus("TODO");
                item.setPath(event.getRoomId() != null ? "/meeting-room" : "/calendar");
                items.add(item);
            }
        }
        if (announcements != null) {
            for (WorkplaceSummaryDTO.AnnouncementItem announcement : announcements) {
                if (items.size() >= 8) {
                    break;
                }
                WorkplaceSummaryDTO.TodayItem item = new WorkplaceSummaryDTO.TodayItem();
                item.setId("announcement-" + announcement.getId());
                item.setType("ANNOUNCEMENT");
                item.setModule("OA");
                item.setSourceLabel("OA 公告");
                item.setTitle(announcement.getTitle());
                item.setDescription(Boolean.TRUE.equals(announcement.getIsRead()) ? "已读公告" : "未读公告");
                item.setTime(announcement.getPublishTime());
                item.setStatus(Boolean.TRUE.equals(announcement.getIsRead()) ? "DONE" : "TODO");
                item.setPath("/announcements");
                items.add(item);
            }
        }
        return items.stream()
                .sorted(Comparator.comparing(WorkplaceSummaryDTO.TodayItem::getTime,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .limit(8)
                .collect(Collectors.toList());
    }

    private List<WorkplaceSummaryDTO.RiskItem> loadRiskItems(Map<String, WorkplaceSummaryDTO.ServiceStatus> serviceHealth,
                                                             WorkplaceSummaryDTO.Stats stats,
                                                             Long userId) {
        try {
            List<OaRiskAlert> risks = riskAlertService.list(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<OaRiskAlert>()
                    .in(OaRiskAlert::getRiskStatus, OaContractConstants.RISK_STATUS_OPEN, OaContractConstants.RISK_STATUS_HANDLING)
                    .orderByDesc(OaRiskAlert::getDetectedTime)
                    .orderByDesc(OaRiskAlert::getId)
                    .last("LIMIT 8"));
            List<WorkplaceSummaryDTO.RiskItem> oaRiskItems = risks.stream().map(this::toRiskItem).collect(Collectors.toList());
            List<WorkplaceSummaryDTO.RiskItem> crmRiskItems = loadCrmRisks();
            List<WorkplaceSummaryDTO.RiskItem> hrRiskItems = loadHrReminders(serviceHealth, userId);
            List<WorkplaceSummaryDTO.RiskItem> contractRiskItems = loadContractMilestoneRisks();
            List<WorkplaceSummaryDTO.RiskItem> merged = mergeRisks(oaRiskItems, crmRiskItems, 8);
            merged = mergeRisks(merged, hrRiskItems, 8);
            merged = mergeRisks(merged, contractRiskItems, 8);
            stats.setOpenRisks(merged.size());
            markService(serviceHealth, "oa.risk", true, "OK");
            return merged;
        } catch (Exception e) {
            log.warn("获取风险提醒失败", e);
            stats.setOpenRisks(0);
            markService(serviceHealth, "oa.risk", false, "风险服务不可用");
            return new ArrayList<>();
        }
    }

    private WorkplaceSummaryDTO.RiskItem toRiskItem(OaRiskAlert risk) {
        WorkplaceSummaryDTO.RiskItem item = new WorkplaceSummaryDTO.RiskItem();
        item.setId(risk.getId());
        item.setBusinessType(risk.getBusinessType());
        item.setBusinessId(risk.getBusinessId());
        item.setModule("OA");
        item.setSourceLabel("OA 风险");
        item.setTitle(risk.getRiskName());
        item.setDescription(risk.getHandleRemark());
        item.setLevel(risk.getRiskLevel());
        item.setStatus(risk.getRiskStatus());
        item.setOwnerName(risk.getOwnerName());
        item.setPath(resolveBusinessPath(risk.getBusinessType(), risk.getBusinessId()));
        return item;
    }

    private WorkplaceSummaryDTO.ActivityItem toActivityItem(OaTraceEvent event) {
        WorkplaceSummaryDTO.ActivityItem item = new WorkplaceSummaryDTO.ActivityItem();
        item.setId(String.valueOf(event.getId()));
        item.setType(event.getEventType());
        item.setModule("OA");
        item.setSourceLabel("OA 动态");
        item.setTitle(event.getEventTitle());
        item.setContent(event.getEventContent());
        item.setOperatorName(event.getOperatorName());
        item.setEventTime(event.getEventTime() == null ? LocalDateTime.now() : event.getEventTime());
        item.setPath(resolveBusinessPath(event.getBusinessType(), event.getBusinessId()));
        return item;
    }

    private String resolveBusinessPath(String businessType, Long businessId) {
        if (!StringUtils.hasText(businessType) || businessId == null) {
            return "/dashboard";
        }
        String normalized = businessType.trim().toUpperCase();
        if (OaContractConstants.BUSINESS_TYPE_CONTRACT.equals(normalized)) {
            return "/office/contracts";
        }
        if ("PROJECT".equals(normalized)) {
            return "/office/project";
        }
        if ("BUDGET".equals(normalized) || "BUDGET_PLAN".equals(normalized) || "BUDGET_ADJUSTMENT".equals(normalized)) {
            return "/office/budget";
        }
        if ("INVOICE".equals(normalized)) {
            return "/office/invoice";
        }
        if ("CRM_CUSTOMER".equals(normalized)) {
            return "/office/crm/customer/" + businessId;
        }
        if ("CRM_RECEIVABLE".equals(normalized)) {
            return "/office/crm/receivables";
        }
        if ("CRM_QUOTE".equals(normalized)) {
            return "/office/crm/quotes";
        }
        if ("CRM_RENEWAL".equals(normalized)) {
            return "/office/crm/renewals";
        }
        if ("ASSET".equals(normalized)) {
            return "/asset/" + businessId;
        }
        if ("VEHICLE".equals(normalized)) {
            return "/vehicle/" + businessId;
        }
        if ("LICENSE".equals(normalized)) {
            return "/license/" + businessId;
        }
        if ("EXPENSE_CLAIM".equals(normalized) || "EXPENSE".equals(normalized)) {
            return "/expense/claim/" + businessId;
        }
        return "/dashboard";
    }

    private List<WorkplaceSummaryDTO.TodayItem> loadCrmTodos(Map<String, WorkplaceSummaryDTO.ServiceStatus> serviceHealth) {
        try {
            var response = remoteCrmWorkplaceService.getDashboardWorkplace();
            if (response == null || !response.isSuccess() || response.getData() == null || response.getData().getTodos() == null) {
                markService(serviceHealth, "crm.todo", false, "CRM 待办返回异常");
                return new ArrayList<>();
            }
            markService(serviceHealth, "crm.todo", true, "OK");
            return response.getData().getTodos().stream().map(item -> {
                WorkplaceSummaryDTO.TodayItem mapped = new WorkplaceSummaryDTO.TodayItem();
                mapped.setId(item.getId());
                mapped.setType(item.getBusinessType());
                mapped.setModule(item.getModule());
                mapped.setSourceLabel(item.getSourceLabel());
                mapped.setTitle(item.getTitle());
                mapped.setDescription(item.getDescription());
                mapped.setStatus(item.getStatus());
                mapped.setPath(item.getPath());
                mapped.setTime(null);
                return mapped;
            }).limit(4).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("获取 CRM 待办失败", e);
            markService(serviceHealth, "crm.todo", false, "CRM 待办不可用");
            return new ArrayList<>();
        }
    }

    private List<WorkplaceSummaryDTO.RiskItem> loadCrmRisks() {
        try {
            var response = remoteCrmWorkplaceService.getDashboardWorkplace();
            if (response == null || !response.isSuccess() || response.getData() == null || response.getData().getRisks() == null) {
                return new ArrayList<>();
            }
            return response.getData().getRisks().stream().map(item -> {
                WorkplaceSummaryDTO.RiskItem mapped = new WorkplaceSummaryDTO.RiskItem();
                mapped.setId(parseLongId(item.getId()));
                mapped.setBusinessType(item.getBusinessType());
                mapped.setBusinessId(item.getBusinessId());
                mapped.setModule(item.getModule());
                mapped.setSourceLabel(item.getSourceLabel());
                mapped.setTitle(item.getTitle());
                mapped.setDescription(item.getDescription());
                mapped.setLevel(item.getLevel());
                mapped.setStatus(item.getStatus());
                mapped.setPath(item.getPath());
                return mapped;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("获取 CRM 风险失败", e);
            return new ArrayList<>();
        }
    }

    private List<WorkplaceSummaryDTO.RiskItem> loadHrReminders(Map<String, WorkplaceSummaryDTO.ServiceStatus> serviceHealth,
                                                               Long userId) {
        try {
            var response = remoteHrWorkplaceService.listReminders(userId, 30, 8);
            if (response == null || !response.isSuccess() || response.getData() == null) {
                markService(serviceHealth, "hr", false, "HR 提醒返回异常");
                return new ArrayList<>();
            }
            markService(serviceHealth, "hr", true, "OK");
            return response.getData().stream().map(item -> {
                WorkplaceSummaryDTO.RiskItem mapped = new WorkplaceSummaryDTO.RiskItem();
                mapped.setId(parseLongId(item.getId()));
                mapped.setBusinessType(item.getBusinessType());
                mapped.setBusinessId(item.getBusinessId());
                mapped.setModule("HR");
                mapped.setSourceLabel(item.getSourceLabel());
                mapped.setTitle(item.getTitle());
                mapped.setDescription(item.getDescription());
                mapped.setLevel(item.getSeverity());
                mapped.setStatus("OPEN");
                mapped.setPath(item.getPath());
                return mapped;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("获取 HR 提醒失败", e);
            markService(serviceHealth, "hr", false, "HR 提醒不可用");
            return new ArrayList<>();
        }
    }

    private List<WorkplaceSummaryDTO.RiskItem> loadContractMilestoneRisks() {
        try {
            List<Map<String, Object>> overdueItems = contractMilestoneService.loadOverdueRiskItems(8);
            if (overdueItems == null || overdueItems.isEmpty()) {
                return new ArrayList<>();
            }
            return overdueItems.stream().map(item -> {
                WorkplaceSummaryDTO.RiskItem mapped = new WorkplaceSummaryDTO.RiskItem();
                String idStr = String.valueOf(item.get("id"));
                mapped.setId(parseLongId(idStr));
                mapped.setBusinessType(String.valueOf(item.get("businessType")));
                Object businessId = item.get("businessId");
                if (businessId instanceof Number num) {
                    mapped.setBusinessId(num.longValue());
                }
                mapped.setModule("OA");
                mapped.setSourceLabel("合同履约");
                mapped.setTitle(String.valueOf(item.get("title")));
                mapped.setDescription(String.valueOf(item.get("description")));
                mapped.setLevel(String.valueOf(item.getOrDefault("level", "HIGH")));
                mapped.setStatus("OPEN");
                mapped.setOwnerName(item.get("ownerName") == null ? null : String.valueOf(item.get("ownerName")));
                mapped.setPath("/office/contracts");
                return mapped;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("获取合同履约风险失败", e);
            return new ArrayList<>();
        }
    }

    private List<WorkplaceSummaryDTO.ActivityItem> loadCrmActivities() {
        try {
            var response = remoteCrmWorkplaceService.getDashboardWorkplace();
            if (response == null || !response.isSuccess() || response.getData() == null || response.getData().getActivities() == null) {
                return new ArrayList<>();
            }
            return response.getData().getActivities().stream().map(item -> {
                WorkplaceSummaryDTO.ActivityItem mapped = new WorkplaceSummaryDTO.ActivityItem();
                mapped.setId(item.getId());
                mapped.setType(item.getBusinessType());
                mapped.setModule(item.getModule());
                mapped.setSourceLabel(item.getSourceLabel());
                mapped.setTitle(item.getTitle());
                mapped.setContent(item.getContent());
                mapped.setOperatorName(item.getOperatorName());
                mapped.setEventTime(item.getEventTime());
                mapped.setPath(item.getPath());
                return mapped;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("获取 CRM 动态失败", e);
            return new ArrayList<>();
        }
    }

    private List<WorkplaceSummaryDTO.TodayItem> mergeTodayItems(List<WorkplaceSummaryDTO.TodayItem> oaItems,
                                                                List<WorkplaceSummaryDTO.TodayItem> crmItems) {
        List<WorkplaceSummaryDTO.TodayItem> merged = new ArrayList<>();
        if (oaItems != null) {
            merged.addAll(oaItems);
        }
        if (crmItems != null) {
            merged.addAll(crmItems);
        }
        return merged.stream().limit(8).collect(Collectors.toList());
    }

    private List<WorkplaceSummaryDTO.RiskItem> mergeRisks(List<WorkplaceSummaryDTO.RiskItem> oaItems,
                                                          List<WorkplaceSummaryDTO.RiskItem> crmItems,
                                                          int limit) {
        List<WorkplaceSummaryDTO.RiskItem> merged = new ArrayList<>();
        if (crmItems != null) {
            merged.addAll(crmItems);
        }
        if (oaItems != null) {
            merged.addAll(oaItems);
        }
        return merged.stream().limit(limit).collect(Collectors.toList());
    }

    private List<WorkplaceSummaryDTO.ActivityItem> mergeActivities(List<WorkplaceSummaryDTO.ActivityItem> oaItems,
                                                                   List<WorkplaceSummaryDTO.ActivityItem> crmItems,
                                                                   int limit) {
        List<WorkplaceSummaryDTO.ActivityItem> merged = new ArrayList<>();
        if (crmItems != null) {
            merged.addAll(crmItems);
        }
        if (oaItems != null) {
            merged.addAll(oaItems);
        }
        return merged.stream()
                .sorted(Comparator.comparing(WorkplaceSummaryDTO.ActivityItem::getEventTime, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(limit)
                .collect(Collectors.toList());
    }

    private Long parseLongId(String value) {
        try {
            return value == null ? null : Long.valueOf(value.replaceAll("[^0-9]", ""));
        } catch (Exception ignored) {
            return null;
        }
    }

    private void markService(Map<String, WorkplaceSummaryDTO.ServiceStatus> serviceHealth,
                             String name,
                             boolean healthy,
                             String message) {
        WorkplaceSummaryDTO.ServiceStatus status = new WorkplaceSummaryDTO.ServiceStatus();
        status.setStatus(healthy ? "UP" : "DOWN");
        status.setMessage(message);
        serviceHealth.put(name, status);
    }

    private int normalizeLimit(Integer limit, int defaultLimit) {
        if (limit == null || limit <= 0) {
            return defaultLimit;
        }
        return Math.min(limit, 100);
    }
}
