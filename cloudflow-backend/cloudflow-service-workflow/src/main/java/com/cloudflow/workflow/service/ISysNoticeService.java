package com.cloudflow.workflow.service;

/**
 * 系统通知服务接口
 * 用于发送各类系统通知（待办任务、审批进度、催办提醒等）
 * 
 * @author CloudFlow
 */
public interface ISysNoticeService {
    
    /**
     * 发送通知
     * 
     * @param userId 接收用户ID
     * @param title 通知标题
     * @param content 通知内容
     * @param type 通知类型（1=通知 2=提醒 3=警告）
     * @param senderId 发送者ID
     * @param senderName 发送者名称
     */
    void sendNotice(Long userId, String title, String content, 
                   String type, Long senderId, String senderName);
}
