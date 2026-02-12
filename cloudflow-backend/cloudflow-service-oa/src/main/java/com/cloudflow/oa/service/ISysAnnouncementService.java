package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysAnnouncement;
import java.util.List;
import java.util.Map;

public interface ISysAnnouncementService extends IService<SysAnnouncement> {
    
    /**
     * 获取我的公告列表
     */
    List<SysAnnouncement> getMyAnnouncements(Long userId);
    
    /**
     * 标记已读
     */
    boolean readAnnouncement(Long announcementId, Long userId);
    
    /**
     * 发布公告
     */
    boolean publish(SysAnnouncement announcement);
    
    /**
     * 获取管理列表（分页）
     */
    Map<String, Object> getManageList(String title, String type, String status, Integer page, Integer size);
    
    /**
     * 编辑公告
     */
    boolean updateAnnouncement(SysAnnouncement announcement);
    
    /**
     * 撤销公告
     */
    boolean revokeAnnouncement(Long announcementId);
    
    /**
     * 切换置顶状态
     */
    boolean toggleTop(Long announcementId);
    
    /**
     * 获取阅读统计
     */
    Map<String, Object> getReadStats(Long announcementId);
}
