package com.cloudflow.oa.service.impl;

import com.cloudflow.common.security.utils.SecurityUtils;
import com.cloudflow.oa.domain.dto.SyncDownloadDTO;
import com.cloudflow.oa.domain.dto.SyncResultDTO;
import com.cloudflow.oa.domain.dto.SyncUploadDTO;
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
                    noticeService.markAsRead(noticeId, userId);
                    log.debug("消息已标记为已读，ID: {}", noticeId);
                }
                break;

            case "schedule_create":
                // 创建日程
                // TODO: 实现日程创建逻辑
                log.debug("创建日程，数据: {}", payload);
                break;

            case "task_complete":
            case "task_approve":
            case "task_reject":
                // 任务操作
                // TODO: 调用工作流服务处理任务操作
                log.debug("处理任务操作，类型: {}, 数据: {}", actionType, payload);
                break;

            case "leave_request":
            case "reimbursement_request":
            case "vehicle_booking":
            case "meeting_booking":
                // 流程申请
                // TODO: 调用工作流服务启动流程
                log.debug("处理流程申请，类型: {}, 数据: {}", actionType, payload);
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

            // 获取增量任务数据
            // TODO: 调用工作流服务获取增量任务
            downloadDTO.setTasks(new ArrayList<>());

            // 获取增量消息数据
            // TODO: 实现获取增量消息逻辑
            downloadDTO.setMessages(new ArrayList<>());

            // 获取增量公告数据
            // TODO: 实现获取增量公告逻辑
            downloadDTO.setAnnouncements(new ArrayList<>());

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
        
        // 根据解决策略处理冲突
        // resolution 可能的值: "local" (使用本地数据), "server" (使用服务器数据), "merge" (合并数据)
        switch (resolution) {
            case "local":
                // 使用本地数据覆盖服务器数据
                log.debug("使用本地数据解决冲突，操作ID: {}", conflict.getActionId());
                // TODO: 实现本地数据覆盖逻辑
                break;

            case "server":
                // 保留服务器数据，丢弃本地更改
                log.debug("使用服务器数据解决冲突，操作ID: {}", conflict.getActionId());
                // 不需要额外操作，服务器数据已存在
                break;

            case "merge":
                // 合并本地和服务器数据
                log.debug("合并数据解决冲突，操作ID: {}", conflict.getActionId());
                // TODO: 实现数据合并逻辑
                break;

            default:
                log.warn("未知的冲突解决策略: {}", resolution);
                throw new IllegalArgumentException("未知的冲突解决策略: " + resolution);
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
