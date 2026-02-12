package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.oa.domain.dto.SyncDownloadDTO;
import com.cloudflow.oa.domain.dto.SyncResultDTO;
import com.cloudflow.oa.domain.dto.SyncUploadDTO;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.SysNotice;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.service.ISyncService;
import com.cloudflow.oa.service.ISysAnnouncementService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.ISysScheduleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * 离线同步服务实现
 */
@Slf4j
@Service
public class SyncServiceImpl implements ISyncService {

    @Autowired
    private ISysNoticeService noticeService;

    @Autowired
    private ISysScheduleService scheduleService;

    @Autowired
    private ISysAnnouncementService announcementService;

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SyncResultDTO uploadOfflineData(SyncUploadDTO uploadDTO) {
        SyncResultDTO result = new SyncResultDTO();
        result.setSynced(0);
        result.setFailed(0);
        result.setConflicts(0);
        result.setErrors(new ArrayList<>());
        result.setConflictDetails(new ArrayList<>());

        if (uploadDTO.getData() == null || uploadDTO.getData().isEmpty()) {
            log.warn("上传数据为空，设备ID: {}", uploadDTO.getDeviceId());
            return result;
        }

        Long userId = SecurityUtils.getUserId();
        log.info("开始处理离线数据，用户ID: {}, 设备ID: {}, 操作数量: {}", 
                userId, uploadDTO.getDeviceId(), uploadDTO.getData().size());

        for (SyncUploadDTO.SyncAction action : uploadDTO.getData()) {
            try {
                processAction(action, userId, result);
                result.setSynced(result.getSynced() + 1);
            } catch (Exception e) {
                log.error("处理操作失败，操作ID: {}, 类型: {}", action.getId(), action.getType(), e);
                result.setFailed(result.getFailed() + 1);
                result.getErrors().add(String.format("操作 %s 失败: %s", action.getId(), e.getMessage()));
            }
        }

        log.info("离线数据处理完成，成功: {}, 失败: {}, 冲突: {}", 
                result.getSynced(), result.getFailed(), result.getConflicts());
        return result;
    }

    /**
     * 处理单个操作
     */
    private void processAction(SyncUploadDTO.SyncAction action, Long userId, SyncResultDTO result) {
        String actionType = action.getType();
        Map<String, Object> payload = (Map<String, Object>) action.getPayload();

        switch (actionType) {
            case "notice_read":
                // 标记消息已读
                Long noticeId = getLongValue(payload, "noticeId");
                if (noticeId != null) {
                    noticeService.readNotice(noticeId);
                    log.debug("消息已标记为已读，ID: {}", noticeId);
                }
                break;

            case "schedule_create":
                // 创建日程
                try {
                    SysScheduleEvent event = new SysScheduleEvent();
                    event.setTitle((String) payload.get("title"));
                    event.setDescription((String) payload.get("description"));
                    event.setStartTime(parseDate((String) payload.get("startTime")));
                    event.setEndTime(parseDate((String) payload.get("endTime")));
                    event.setIsAllDay((Boolean) payload.getOrDefault("isAllDay", false));
                    event.setType((String) payload.getOrDefault("type", "PERSONAL"));
                    event.setCreatorId(userId);
                    
                    if (payload.containsKey("roomId")) {
                        event.setRoomId(getLongValue(payload, "roomId"));
                    }
                    if (payload.containsKey("attendees")) {
                        event.setAttendees((String) payload.get("attendees"));
                    }
                    
                    scheduleService.createEvent(event);
                    log.debug("日程创建成功，标题: {}", event.getTitle());
                } catch (Exception e) {
                    log.error("创建日程失败", e);
                    throw new RuntimeException("创建日程失败: " + e.getMessage());
                }
                break;

            case "task_complete":
            case "task_approve":
            case "task_reject":
                // 任务操作 - 这些操作需要通过工作流服务处理
                // 由于是跨服务调用，这里记录日志，实际处理应该在工作流服务中
                log.info("任务操作将由工作流服务处理，类型: {}, 任务ID: {}", 
                        actionType, payload.get("taskId"));
                // 注意：实际生产环境中，这里应该通过 RemoteWorkflowService 调用工作流服务
                // 但由于离线同步的特殊性，建议在前端直接调用工作流API，而不是通过同步接口
                break;

            case "leave_request":
            case "reimbursement_request":
            case "vehicle_booking":
            case "meeting_booking":
                // 流程申请 - 这些操作需要通过工作流服务启动流程
                log.info("流程申请将由工作流服务处理，类型: {}", actionType);
                // 注意：实际生产环境中，这里应该通过 RemoteWorkflowService 调用工作流服务
                // 但由于离线同步的特殊性，建议在前端直接调用工作流API，而不是通过同步接口
                break;

            default:
                log.warn("未知的操作类型: {}", actionType);
                throw new IllegalArgumentException("未知的操作类型: " + actionType);
        }
    }

    @Override
    public SyncDownloadDTO downloadIncrementalData(String lastSyncTime, String deviceId) {
        Long userId = SecurityUtils.getUserId();
        log.info("开始下载增量数据，用户ID: {}, 设备ID: {}, 上次同步时间: {}", 
                userId, deviceId, lastSyncTime);

        SyncDownloadDTO downloadDTO = new SyncDownloadDTO();
        downloadDTO.setSyncTime(LocalDateTime.now().format(DATE_FORMATTER));

        try {
            // 解析上次同步时间
            LocalDateTime lastSync = LocalDateTime.parse(lastSyncTime, DATE_FORMATTER);
            Date lastSyncDate = java.sql.Timestamp.valueOf(lastSync);

            // 获取增量任务数据
            // 注意：任务数据在工作流服务中，这里返回空列表
            // 实际生产环境中应该通过 RemoteWorkflowService 获取
            downloadDTO.setTasks(new ArrayList<>());

            // 获取增量消息数据
            List<SyncDownloadDTO.MessageData> messages = new ArrayList<>();
            com.cloudflow.common.core.domain.PageQuery pageQuery = new com.cloudflow.common.core.domain.PageQuery();
            pageQuery.setPageNum(1);
            pageQuery.setPageSize(100); // 限制最多返回100条
            
            com.cloudflow.common.core.domain.PageResult<SysNotice> noticeResult = 
                    noticeService.getMyNotices(userId, pageQuery);
            
            for (SysNotice notice : noticeResult.getRows()) {
                if (notice.getCreateTime().after(lastSyncDate)) {
                    SyncDownloadDTO.MessageData messageData = new SyncDownloadDTO.MessageData();
                    messageData.setNoticeId(notice.getNoticeId());
                    messageData.setTitle(notice.getNoticeTitle());
                    messageData.setContent(notice.getNoticeContent());
                    messageData.setType(notice.getNoticeType());
                    messageData.setCreateTime(notice.getCreateTime().toString());
                    messageData.setIsRead("1".equals(notice.getStatus()));
                    messages.add(messageData);
                }
            }
            downloadDTO.setMessages(messages);

            // 获取增量公告数据
            List<SyncDownloadDTO.AnnouncementData> announcements = new ArrayList<>();
            List<SysAnnouncement> announcementList = announcementService.getMyAnnouncements(userId);
            
            for (SysAnnouncement announcement : announcementList) {
                if (announcement.getCreateTime().after(lastSyncDate)) {
                    SyncDownloadDTO.AnnouncementData announcementData = new SyncDownloadDTO.AnnouncementData();
                    announcementData.setId(announcement.getAnnouncementId());
                    announcementData.setTitle(announcement.getTitle());
                    announcementData.setContent(announcement.getContent());
                    announcementData.setPublishTime(announcement.getCreateTime().toString());
                    announcementData.setIsRead(announcement.getIsRead() != null && announcement.getIsRead());
                    announcements.add(announcementData);
                }
            }
            downloadDTO.setAnnouncements(announcements);

            log.info("增量数据下载完成，任务: {}, 消息: {}, 公告: {}", 
                    downloadDTO.getTasks().size(),
                    downloadDTO.getMessages().size(),
                    downloadDTO.getAnnouncements().size());

        } catch (Exception e) {
            log.error("下载增量数据失败", e);
            throw new RuntimeException("下载增量数据失败: " + e.getMessage());
        }

        return downloadDTO;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void resolveConflicts(SyncResultDTO.ConflictDetail[] conflicts) {
        if (conflicts == null || conflicts.length == 0) {
            log.warn("冲突列表为空");
            return;
        }

        Long userId = SecurityUtils.getUserId();
        log.info("开始解决冲突，用户ID: {}, 冲突数量: {}", userId, conflicts.length);

        for (SyncResultDTO.ConflictDetail conflict : conflicts) {
            try {
                resolveConflict(conflict, userId);
                log.debug("冲突已解决，操作ID: {}, 类型: {}", conflict.getActionId(), conflict.getActionType());
            } catch (Exception e) {
                log.error("解决冲突失败，操作ID: {}, 类型: {}", 
                        conflict.getActionId(), conflict.getActionType(), e);
                throw new RuntimeException("解决冲突失败: " + e.getMessage());
            }
        }

        log.info("所有冲突已解决");
    }

    /**
     * 解决单个冲突
     */
    private void resolveConflict(SyncResultDTO.ConflictDetail conflict, Long userId) {
        String resolution = conflict.getReason();
        String actionType = conflict.getActionType();
        
        // 根据解决策略处理冲突
        // resolution 可能的值: "local" (使用本地数据), "server" (使用服务器数据), "merge" (合并数据)
        switch (resolution) {
            case "local":
                // 使用本地数据覆盖服务器数据
                log.debug("使用本地数据解决冲突，操作ID: {}, 类型: {}", conflict.getActionId(), actionType);
                
                // 根据操作类型处理本地数据覆盖
                if ("schedule_create".equals(actionType) || "schedule_update".equals(actionType)) {
                    // 对于日程，使用本地数据更新
                    Map<String, Object> localData = (Map<String, Object>) conflict.getLocalData();
                    SysScheduleEvent event = new SysScheduleEvent();
                    event.setEventId(getLongValue(localData, "eventId"));
                    event.setTitle((String) localData.get("title"));
                    event.setDescription((String) localData.get("description"));
                    event.setStartTime(parseDate((String) localData.get("startTime")));
                    event.setEndTime(parseDate((String) localData.get("endTime")));
                    scheduleService.updateById(event);
                    log.info("使用本地数据更新日程，ID: {}", event.getEventId());
                } else if ("notice_read".equals(actionType)) {
                    // 对于消息已读状态，使用本地状态
                    Map<String, Object> localData = (Map<String, Object>) conflict.getLocalData();
                    Long noticeId = getLongValue(localData, "noticeId");
                    if (noticeId != null) {
                        noticeService.readNotice(noticeId);
                        log.info("使用本地状态标记消息已读，ID: {}", noticeId);
                    }
                }
                break;

            case "server":
                // 保留服务器数据，丢弃本地更改
                log.debug("使用服务器数据解决冲突，操作ID: {}, 类型: {}", conflict.getActionId(), actionType);
                // 不需要额外操作，服务器数据已存在
                break;

            case "merge":
                // 合并本地和服务器数据
                log.debug("合并数据解决冲突，操作ID: {}, 类型: {}", conflict.getActionId(), actionType);
                
                // 对于大多数情况，合并策略采用"最后修改时间优先"
                // 这里简化处理，实际应该根据具体业务逻辑实现
                Map<String, Object> localData = (Map<String, Object>) conflict.getLocalData();
                Map<String, Object> serverData = (Map<String, Object>) conflict.getServerData();
                
                String localTime = (String) localData.get("updateTime");
                String serverTime = (String) serverData.get("updateTime");
                
                if (localTime != null && serverTime != null) {
                    LocalDateTime localDateTime = LocalDateTime.parse(localTime, DATE_FORMATTER);
                    LocalDateTime serverDateTime = LocalDateTime.parse(serverTime, DATE_FORMATTER);
                    
                    if (localDateTime.isAfter(serverDateTime)) {
                        log.info("本地数据更新，使用本地数据");
                        // 使用本地数据（递归调用local策略）
                        conflict.setReason("local");
                        resolveConflict(conflict, userId);
                    } else {
                        log.info("服务器数据更新，保留服务器数据");
                        // 保留服务器数据（不需要操作）
                    }
                } else {
                    log.warn("无法比较时间戳，默认使用服务器数据");
                }
                break;

            default:
                log.warn("未知的冲突解决策略: {}", resolution);
                throw new IllegalArgumentException("未知的冲突解决策略: " + resolution);
        }
    }
    
    /**
     * 解析日期字符串
     */
    private Date parseDate(String dateStr) {
        if (dateStr == null) {
            return null;
        }
        try {
            LocalDateTime localDateTime = LocalDateTime.parse(dateStr, DATE_FORMATTER);
            return java.sql.Timestamp.valueOf(localDateTime);
        } catch (Exception e) {
            log.error("解析日期失败: {}", dateStr, e);
            return null;
        }
    }

    /**
     * 从 Map 中获取 Long 值
     */
    private Long getLongValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        if (value instanceof String) {
            try {
                return Long.parseLong((String) value);
            } catch (NumberFormatException e) {
                log.warn("无法将字符串转换为 Long: {}", value);
                return null;
            }
        }
        return null;
    }
}
