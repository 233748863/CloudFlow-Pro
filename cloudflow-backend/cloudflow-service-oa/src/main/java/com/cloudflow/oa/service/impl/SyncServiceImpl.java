package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.SysNotice;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.SyncDownloadDTO;
import com.cloudflow.oa.domain.dto.SyncResultDTO;
import com.cloudflow.oa.domain.dto.SyncUploadDTO;
import com.cloudflow.oa.service.ISyncService;
import com.cloudflow.oa.service.ISysAnnouncementService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.ISysScheduleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class SyncServiceImpl implements ISyncService {

    private static final DateTimeFormatter SYNC_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    private final ISysNoticeService noticeService;
    private final ISysScheduleService scheduleService;
    private final ISysAnnouncementService announcementService;

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
            return result;
        }

        Long userId = SecurityUtils.getUserId();
        for (SyncUploadDTO.SyncAction action : uploadDTO.getData()) {
            try {
                processAction(action, userId);
                result.setSynced(result.getSynced() + 1);
            } catch (Exception e) {
                log.warn("offline sync action failed: {}", action.getType(), e);
                result.setFailed(result.getFailed() + 1);
                result.getErrors().add(String.format("action %s failed: %s", action.getId(), e.getMessage()));
            }
        }

        return result;
    }

    @SuppressWarnings("unchecked")
    private void processAction(SyncUploadDTO.SyncAction action, Long userId) {
        Map<String, Object> payload = (Map<String, Object>) action.getPayload();
        switch (action.getType()) {
            case "notice_read":
                Long noticeId = getLongValue(payload, "noticeId");
                if (noticeId != null) {
                    noticeService.readNotice(noticeId);
                }
                return;
            case "schedule_create":
                SysScheduleEvent event = new SysScheduleEvent();
                event.setTitle((String) payload.get("title"));
                event.setDescription((String) payload.get("description"));
                event.setStartTime(parseDate((String) payload.get("startTime")));
                event.setEndTime(parseDate((String) payload.get("endTime")));
                event.setIsAllDay((Boolean) payload.getOrDefault("isAllDay", false));
                event.setType((String) payload.getOrDefault("type", "PERSONAL"));
                event.setCreatorId(userId);
                if (payload.containsKey("attendees")) {
                    event.setAttendees((String) payload.get("attendees"));
                }
                scheduleService.createEvent(event);
                return;
            default:
                throw new IllegalArgumentException("unsupported sync action: " + action.getType());
        }
    }

    @Override
    public SyncDownloadDTO downloadIncrementalData(String lastSyncTime, String deviceId) {
        Long userId = SecurityUtils.getUserId();
        LocalDateTime lastSync = parseSyncTime(lastSyncTime);

        SyncDownloadDTO downloadDTO = new SyncDownloadDTO();
        downloadDTO.setSyncTime(LocalDateTime.now().format(SYNC_TIME_FORMATTER));
        downloadDTO.setMessages(loadMessages(userId, lastSync));
        downloadDTO.setAnnouncements(loadAnnouncements(userId, lastSync));
        return downloadDTO;
    }

    private List<SyncDownloadDTO.MessageData> loadMessages(Long userId, LocalDateTime lastSync) {
        PageQuery pageQuery = new PageQuery();
        pageQuery.setPageNum(1);
        pageQuery.setPageSize(100);
        PageResult<SysNotice> noticeResult = noticeService.getMyNotices(userId, pageQuery);
        List<SyncDownloadDTO.MessageData> messages = new ArrayList<>();
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
        return messages;
    }

    private List<SyncDownloadDTO.AnnouncementData> loadAnnouncements(Long userId, LocalDateTime lastSync) {
        List<SyncDownloadDTO.AnnouncementData> announcements = new ArrayList<>();
        for (SysAnnouncement announcement : announcementService.getMyAnnouncements(userId)) {
            if (announcement.getCreateTime() != null && announcement.getCreateTime().isAfter(lastSync)) {
                SyncDownloadDTO.AnnouncementData announcementData = new SyncDownloadDTO.AnnouncementData();
                announcementData.setId(announcement.getAnnouncementId());
                announcementData.setTitle(announcement.getTitle());
                announcementData.setContent(announcement.getContent());
                announcementData.setPublishTime(announcement.getCreateTime().toString());
                announcementData.setIsRead(Boolean.TRUE.equals(announcement.getIsRead()));
                announcements.add(announcementData);
            }
        }
        return announcements;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void resolveConflicts(SyncResultDTO.ConflictDetail[] conflicts) {
        log.debug("light sync ignores conflict resolution request, count={}", conflicts == null ? 0 : conflicts.length);
    }

    private LocalDateTime parseDate(String dateStr) {
        if (dateStr == null) {
            return null;
        }
        try {
            if (dateStr.contains("T")) {
                return LocalDateTime.ofInstant(Instant.parse(dateStr), ZoneId.systemDefault());
            }
            return LocalDateTime.parse(dateStr, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        } catch (Exception e) {
            return LocalDateTime.parse(dateStr);
        }
    }

    private LocalDateTime parseSyncTime(String syncTime) {
        if (syncTime == null || syncTime.isBlank()) {
            return LocalDateTime.of(1970, 1, 1, 0, 0);
        }
        try {
            return LocalDateTime.parse(syncTime, SYNC_TIME_FORMATTER);
        } catch (Exception e) {
            return LocalDateTime.ofInstant(Instant.parse(syncTime), ZoneId.systemDefault());
        }
    }

    private Long getLongValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Long.parseLong(text);
        }
        return null;
    }
}
