package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.SysNotice;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.SyncDeviceRegisterDTO;
import com.cloudflow.oa.domain.dto.SyncDownloadDTO;
import com.cloudflow.oa.domain.dto.SyncResultDTO;
import com.cloudflow.oa.domain.dto.SyncUploadDTO;
import com.cloudflow.oa.service.IOaSyncDeviceService;
import com.cloudflow.oa.service.ISyncService;
import com.cloudflow.oa.service.ISysAnnouncementService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.ISysScheduleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
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

    @Autowired
    private IOaSyncDeviceService syncDeviceService;

    @Autowired
    private OaProperties oaProperties;

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");
    private static final String CONFLICT_STRATEGY_LAST_WRITE_WINS = "LAST_WRITE_WINS";

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void registerDevice(SyncDeviceRegisterDTO registerDTO) {
        syncDeviceService.registerDevice(
                registerDTO == null ? null : registerDTO.getDeviceId(),
                registerDTO == null ? null : registerDTO.getDeviceName(),
                SecurityUtils.getUserId(),
                UserContext.getTenantId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SyncResultDTO uploadOfflineData(SyncUploadDTO uploadDTO) {
        if (uploadDTO == null) {
            throw new ServiceException("同步请求不能为空");
        }

        SyncResultDTO result = new SyncResultDTO();
        result.setSynced(0);
        result.setFailed(0);
        result.setConflicts(0);
        result.setErrors(new ArrayList<>());
        result.setConflictDetails(new ArrayList<>());

        Long userId = SecurityUtils.getUserId();
        Long tenantId = UserContext.getTenantId();
        syncDeviceService.validateDevice(uploadDTO.getDeviceId(), userId, tenantId);

        if (uploadDTO.getData() == null || uploadDTO.getData().isEmpty()) {
            log.warn("上传数据为空，设备ID: {}", uploadDTO.getDeviceId());
            syncDeviceService.updateLastSyncTime(uploadDTO.getDeviceId(), userId, tenantId, uploadDTO.getTimestamp());
            return result;
        }

        log.info("开始处理离线数据，用户ID: {}, 设备ID: {}, 操作数量: {}",
                userId, uploadDTO.getDeviceId(), uploadDTO.getData().size());

        for (SyncUploadDTO.SyncAction action : uploadDTO.getData()) {
            try {
                processAction(action, userId);
                result.setSynced(result.getSynced() + 1);
            } catch (Exception e) {
                log.error("处理操作失败，操作ID: {}, 类型: {}", action == null ? null : action.getId(), action == null ? null : action.getType(), e);
                result.setFailed(result.getFailed() + 1);
                result.getErrors().add(String.format("操作 %s 失败: %s", action == null ? null : action.getId(), e.getMessage()));
            }
        }

        syncDeviceService.updateLastSyncTime(uploadDTO.getDeviceId(), userId, tenantId, uploadDTO.getTimestamp());
        log.info("离线数据处理完成，成功: {}, 失败: {}, 冲突: {}",
                result.getSynced(), result.getFailed(), result.getConflicts());
        return result;
    }

    private void processAction(SyncUploadDTO.SyncAction action, Long userId) {
        if (action == null) {
            throw new ServiceException("同步操作不能为空");
        }
        String actionType = action.getType();
        Map<String, Object> payload = requirePayload(action);

        switch (actionType) {
            case "notice_read":
                Long noticeId = getLongValue(payload, "noticeId");
                if (noticeId != null) {
                    noticeService.readNotice(noticeId);
                    log.debug("消息已标记为已读，ID: {}", noticeId);
                }
                break;

            case "schedule_create":
                try {
                    SysScheduleEvent event = new SysScheduleEvent();
                    event.setTitle((String) payload.get("title"));
                    event.setDescription((String) payload.get("description"));
                    event.setStartTime(parseDateTime(payload.get("startTime")));
                    event.setEndTime(parseDateTime(payload.get("endTime")));
                    event.setIsAllDay((Boolean) payload.getOrDefault("isAllDay", false));
                    event.setType((String) payload.getOrDefault("type", "PERSONAL"));
                    event.setCreatorId(userId);
                    event.setTenantId(UserContext.getTenantId());

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
                log.info("任务操作将由工作流服务处理，类型: {}, 任务ID: {}",
                        actionType, payload.get("taskId"));
                break;

            case "hr_leave_request":
            case "reimbursement_request":
            case "vehicle_booking":
            case "meeting_booking":
                log.info("流程申请将由工作流服务处理，类型: {}", actionType);
                break;

            default:
                log.warn("未知的操作类型: {}", actionType);
                throw new IllegalArgumentException("未知的操作类型: " + actionType);
        }
    }

    @Override
    public SyncDownloadDTO downloadIncrementalData(Long lastSyncTime, String deviceId) {
        Long userId = SecurityUtils.getUserId();
        Long tenantId = UserContext.getTenantId();
        syncDeviceService.validateDevice(deviceId, userId, tenantId);
        log.info("开始下载增量数据，用户ID: {}, 设备ID: {}, 上次同步时间: {}",
                userId, deviceId, lastSyncTime);

        SyncDownloadDTO downloadDTO = new SyncDownloadDTO();
        long currentSyncTime = System.currentTimeMillis();
        downloadDTO.setSyncTime(currentSyncTime);

        try {
            LocalDateTime lastSync = toDateTime(lastSyncTime);

            downloadDTO.setTasks(new ArrayList<>());

            List<SyncDownloadDTO.MessageData> messages = new ArrayList<>();
            com.cloudflow.common.core.domain.PageQuery pageQuery = new com.cloudflow.common.core.domain.PageQuery();
            pageQuery.setPageNum(1);
            pageQuery.setPageSize(100);

            com.cloudflow.common.core.domain.PageResult<SysNotice> noticeResult =
                    noticeService.getMyNotices(userId, pageQuery);

            for (SysNotice notice : noticeResult.getRows()) {
                if (notice.getCreateTime() != null && notice.getCreateTime().isAfter(lastSync)) {
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

            List<SyncDownloadDTO.AnnouncementData> announcements = new ArrayList<>();
            List<SysAnnouncement> announcementList = announcementService.getMyAnnouncements(userId);

            for (SysAnnouncement announcement : announcementList) {
                if (announcement.getCreateTime() != null && announcement.getCreateTime().isAfter(lastSync)) {
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
            syncDeviceService.updateLastSyncTime(deviceId, userId, tenantId, currentSyncTime);

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

    private void resolveConflict(SyncResultDTO.ConflictDetail conflict, Long userId) {
        String resolution = conflict.getReason();
        String actionType = conflict.getActionType();

        switch (resolution) {
            case "local":
                log.debug("使用本地数据解决冲突，操作ID: {}, 类型: {}", conflict.getActionId(), actionType);

                if ("schedule_create".equals(actionType) || "schedule_update".equals(actionType)) {
                    Map<String, Object> localData = castObjectMap(conflict.getLocalData());
                    SysScheduleEvent event = new SysScheduleEvent();
                    event.setEventId(getLongValue(localData, "eventId"));
                    event.setTitle((String) localData.get("title"));
                    event.setDescription((String) localData.get("description"));
                    event.setStartTime(parseDateTime(localData.get("startTime")));
                    event.setEndTime(parseDateTime(localData.get("endTime")));
                    scheduleService.updateById(event);
                    log.info("使用本地数据更新日程，ID: {}", event.getEventId());
                } else if ("notice_read".equals(actionType)) {
                    Map<String, Object> localData = castObjectMap(conflict.getLocalData());
                    Long noticeId = getLongValue(localData, "noticeId");
                    if (noticeId != null) {
                        noticeService.readNotice(noticeId);
                        log.info("使用本地状态标记消息已读，ID: {}", noticeId);
                    }
                }
                break;

            case "server":
                log.debug("使用服务器数据解决冲突，操作ID: {}, 类型: {}", conflict.getActionId(), actionType);
                break;

            case "merge":
                log.debug("合并数据解决冲突，操作ID: {}, 类型: {}", conflict.getActionId(), actionType);
                applyConfiguredConflictStrategy(conflict, userId);
                break;

            default:
                log.warn("未知的冲突解决策略: {}", resolution);
                throw new IllegalArgumentException("未知的冲突解决策略: " + resolution);
        }
    }

    private void applyConfiguredConflictStrategy(SyncResultDTO.ConflictDetail conflict, Long userId) {
        String strategy = oaProperties.getSync().getConflictStrategy();
        if (!CONFLICT_STRATEGY_LAST_WRITE_WINS.equalsIgnoreCase(strategy)) {
            throw new ServiceException("未支持的同步冲突策略: " + strategy);
        }

        if (conflict.getLocalData() == null || conflict.getServerData() == null) {
            log.warn("冲突数据不完整，默认保留服务器数据，actionId={}", conflict.getActionId());
            return;
        }

        Map<String, Object> localData = castObjectMap(conflict.getLocalData());
        Map<String, Object> serverData = castObjectMap(conflict.getServerData());
        LocalDateTime localTime = parseDateTime(localData.get("updateTime"));
        LocalDateTime serverTime = parseDateTime(serverData.get("updateTime"));

        if (localTime == null || serverTime == null) {
            log.warn("无法比较时间戳，默认保留服务器数据，actionId={}", conflict.getActionId());
            return;
        }

        long seconds = Math.abs(ChronoUnit.SECONDS.between(localTime, serverTime));
        if (seconds <= oaProperties.getSync().getTimeToleranceSeconds()) {
            log.info("冲突时间差在容差内，默认保留服务器数据，actionId={}, seconds={}", conflict.getActionId(), seconds);
            return;
        }

        if (localTime.isAfter(serverTime)) {
            conflict.setReason("local");
            resolveConflict(conflict, userId);
            return;
        }

        log.info("服务器数据更新时间更新，保留服务器数据，actionId={}", conflict.getActionId());
    }

    private Map<String, Object> requirePayload(SyncUploadDTO.SyncAction action) {
        if (!(action.getPayload() instanceof Map<?, ?> payload)) {
            throw new ServiceException("同步操作载荷格式不正确");
        }
        return castObjectMap(payload);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castObjectMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            throw new ServiceException("同步冲突数据格式不正确");
        }
        return (Map<String, Object>) map;
    }

    private LocalDateTime parseDateTime(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number) {
            return toDateTime(((Number) value).longValue());
        }
        String text = String.valueOf(value);
        if (text.isEmpty()) {
            return null;
        }
        try {
            if (text.matches("^\\d+$")) {
                return toDateTime(Long.parseLong(text));
            }
            return LocalDateTime.parse(text, DATE_FORMATTER);
        } catch (Exception e) {
            log.error("解析日期失败: {}", value, e);
            return null;
        }
    }

    private LocalDateTime toDateTime(Long timeMillis) {
        if (timeMillis == null || timeMillis <= 0) {
            return LocalDateTime.of(1970, 1, 1, 0, 0);
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(timeMillis), ZoneId.systemDefault());
    }

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
