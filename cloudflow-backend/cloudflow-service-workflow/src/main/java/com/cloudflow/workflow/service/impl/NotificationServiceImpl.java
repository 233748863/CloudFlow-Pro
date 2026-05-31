package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfNotificationConfig;
import com.cloudflow.workflow.domain.WfNotificationLog;
import com.cloudflow.workflow.mapper.WfNotificationConfigMapper;
import com.cloudflow.workflow.mapper.WfNotificationLogMapper;
import com.cloudflow.workflow.service.INotificationService;
import com.cloudflow.workflow.service.ISysNoticeService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 通知服务实现类
 * 支持多种通知渠道：站内信、邮件
 * 使用异步方式发送通知，不阻塞主流程
 * 
 * 通知渠道说明：
 * - INTERNAL: 站内信（通过 WebSocket 实时推送）
 * - EMAIL: 邮件（预留接口，待实现）
 * 
 * @author CloudFlow Team
 * @since 2026-02-28
 */
@Slf4j
@Service
public class NotificationServiceImpl implements INotificationService {
    
    @Autowired
    private WfNotificationConfigMapper notificationConfigMapper;
    
    @Autowired
    private WfNotificationLogMapper notificationLogMapper;
    
    @Autowired
    private ISysNoticeService sysNoticeService;
    
    // 通知渠道常量
    private static final String CHANNEL_INTERNAL = "INTERNAL";  // 站内信
    private static final String CHANNEL_EMAIL = "EMAIL";        // 邮件
    
    // 事件类型常量
    private static final String EVENT_ARCHIVE = "WORKFLOW_ARCHIVE";      // 流程归档
    private static final String EVENT_RESTORE = "WORKFLOW_RESTORE";      // 流程恢复
    private static final String EVENT_ROLLBACK = "VERSION_ROLLBACK";     // 版本回滚
    
    // 通知状态常量
    private static final String STATUS_SUCCESS = "SUCCESS";
    private static final String STATUS_FAILED = "FAILED";
    
    @Override
    @Async("notificationExecutor")
    public void sendArchiveNotification(Long creatorId, String workflowId, 
                                       String workflowName, String archiveReason, 
                                       String operatorName) {
        if (creatorId == null) {
            log.warn("[归档通知] 流程创建者ID为空，跳过通知发送: workflowId={}", workflowId);
            return;
        }
        
        log.info("[归档通知] 开始发送归档通知: creatorId={}, workflowId={}, workflowName={}", 
                creatorId, workflowId, workflowName);
        
        // 构建通知标题和内容
        String title = "流程归档通知";
        String content = String.format(
            "您创建的流程「%s」已被管理员 %s 归档。\n归档原因：%s\n如需恢复，请联系管理员。",
            workflowName, operatorName, archiveReason
        );
        
        // 发送通知
        sendNotification(creatorId, title, content, EVENT_ARCHIVE);
    }
    
    @Override
    @Async("notificationExecutor")
    public void sendRestoreNotification(Long creatorId, String workflowId, 
                                       String workflowName, String operatorName) {
        if (creatorId == null) {
            log.warn("[恢复通知] 流程创建者ID为空，跳过通知发送: workflowId={}", workflowId);
            return;
        }
        
        log.info("[恢复通知] 开始发送恢复通知: creatorId={}, workflowId={}, workflowName={}", 
                creatorId, workflowId, workflowName);
        
        // 构建通知标题和内容
        String title = "流程恢复通知";
        String content = String.format(
            "您创建的流程「%s」已被管理员 %s 从归档状态恢复，现在可以正常使用。",
            workflowName, operatorName
        );
        
        // 发送通知
        sendNotification(creatorId, title, content, EVENT_RESTORE);
    }
    
    @Override
    @Async("notificationExecutor")
    public void sendRollbackNotification(Long creatorId, String workflowId, 
                                        String workflowName, String fromVersion, 
                                        String toVersion, String rollbackReason, 
                                        String operatorName) {
        if (creatorId == null) {
            log.warn("[回滚通知] 流程创建者ID为空，跳过通知发送: workflowId={}", workflowId);
            return;
        }
        
        log.info("[回滚通知] 开始发送回滚通知: creatorId={}, workflowId={}, fromVersion={}, toVersion={}", 
                creatorId, workflowId, fromVersion, toVersion);
        
        // 构建通知标题和内容
        String title = "流程版本回滚通知";
        String content = String.format(
            "您创建的流程「%s」已被管理员 %s 从版本 %s 回滚到版本 %s。\n回滚原因：%s",
            workflowName, operatorName, fromVersion, toVersion, rollbackReason
        );
        
        // 发送通知
        sendNotification(creatorId, title, content, EVENT_ROLLBACK);
    }
    
    @Override
    @Async("notificationExecutor")
    public void sendNotification(Long recipientId, String title, String content, String eventType) {
        if (recipientId == null) {
            log.warn("[通用通知] 接收者ID为空，跳过通知发送");
            return;
        }
        
        log.info("[通用通知] 开始发送通知: recipientId={}, title={}, eventType={}", 
                recipientId, title, eventType);
        
        try {
            // 1. 查询该事件类型的通知配置
            List<WfNotificationConfig> configs = getNotificationConfigs(eventType);
            
            // 2. 如果没有配置，使用默认配置（站内信）
            if (configs.isEmpty()) {
                log.info("[通用通知] 未找到事件类型 {} 的通知配置，使用默认站内信渠道", eventType);
                sendInternalNotification(recipientId, title, content, eventType);
                return;
            }
            
            // 3. 根据配置发送通知
            for (WfNotificationConfig config : configs) {
                if (config.getEnabled() != null && config.getEnabled() == 1) {
                    String channel = config.getNotifyChannel();
                    
                    switch (channel) {
                        case CHANNEL_INTERNAL:
                            sendInternalNotification(recipientId, title, content, eventType);
                            break;
                        case CHANNEL_EMAIL:
                            sendEmailNotification(recipientId, title, content, eventType);
                            break;
                        default:
                            log.warn("[通用通知] 不支持的通知渠道: {}", channel);
                    }
                }
            }
            
        } catch (Exception e) {
            log.error("[通用通知] 发送通知失败: recipientId={}, title={}, error={}", 
                    recipientId, title, e.getMessage(), e);
        }
    }
    
    /**
     * 发送站内信通知
     * 通过 WebSocket 实时推送给用户
     */
    private void sendInternalNotification(Long recipientId, String title, 
                                         String content, String eventType) {
        String logId = UUID.randomUUID().toString().replace("-", "");
        
        try {
            log.debug("[站内信] 发送站内信通知: recipientId={}, title={}", recipientId, title);
            
            // 调用系统通知服务发送站内信
            sysNoticeService.sendNotice(
                recipientId,
                title,
                content,
                "1",  // 通知类型：1=通知
                null, // 发送者ID（系统通知）
                "系统"  // 发送者名称
            );
            
            // 记录通知日志
            saveNotificationLog(logId, eventType, CHANNEL_INTERNAL, recipientId, 
                              null, title, content, STATUS_SUCCESS, null);
            
            log.info("[站内信] 站内信通知发送成功: recipientId={}, title={}", recipientId, title);
            
        } catch (Exception e) {
            log.error("[站内信] 站内信通知发送失败: recipientId={}, title={}, error={}", 
                    recipientId, title, e.getMessage(), e);
            
            // 记录失败日志
            saveNotificationLog(logId, eventType, CHANNEL_INTERNAL, recipientId, 
                              null, title, content, STATUS_FAILED, e.getMessage());
        }
    }
    
    /**
     * 发送邮件通知
     * 预留接口，待实现邮件发送功能
     */
    private void sendEmailNotification(Long recipientId, String title, 
                                      String content, String eventType) {
        String logId = UUID.randomUUID().toString().replace("-", "");
        
        log.warn("[邮件] 邮件通知功能暂未实现: recipientId={}, title={}", recipientId, title);
        
        // TODO: 实现邮件发送功能
        // 1. 查询用户邮箱地址
        // 2. 构建邮件内容（HTML格式）
        // 3. 调用邮件服务发送
        
        // 记录通知日志（标记为失败，因为功能未实现）
        saveNotificationLog(logId, eventType, CHANNEL_EMAIL, recipientId, 
                          null, title, content, STATUS_FAILED, "邮件功能暂未实现");
    }
    
    /**
     * 查询通知配置
     * 根据事件类型查询启用的通知配置
     */
    private List<WfNotificationConfig> getNotificationConfigs(String eventType) {
        try {
            LambdaQueryWrapper<WfNotificationConfig> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(WfNotificationConfig::getEventType, eventType)
                   .eq(WfNotificationConfig::getEnabled, 1);
            
            return notificationConfigMapper.selectList(wrapper);
        } catch (Exception e) {
            log.error("[通知配置] 查询通知配置失败: eventType={}, error={}", 
                    eventType, e.getMessage(), e);
            return List.of();
        }
    }
    
    /**
     * 保存通知日志
     * 记录每次通知发送的详细信息
     */
    private void saveNotificationLog(String logId, String eventType, String channel, 
                                     Long recipientId, String recipientName, 
                                     String title, String content, 
                                     String status, String errorMsg) {
        try {
            WfNotificationLog log = new WfNotificationLog();
            log.setLogId(logId);
            log.setEventType(eventType);
            log.setNotifyChannel(channel);
            log.setRecipientId(recipientId);
            log.setRecipientName(recipientName);
            log.setTitle(title);
            log.setContent(content);
            log.setStatus(status);
            log.setErrorMsg(errorMsg);
            log.setCreateTime(LocalDateTime.now());
            
            if (STATUS_SUCCESS.equals(status)) {
                log.setSentTime(LocalDateTime.now());
            }
            
            notificationLogMapper.insert(log);
            
        } catch (Exception e) {
            // 日志记录失败不应影响通知发送，仅记录错误
            this.log.error("[通知日志] 保存通知日志失败: logId={}, error={}", 
                    logId, e.getMessage(), e);
        }
    }
}
