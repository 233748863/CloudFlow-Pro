package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.workflow.domain.SysAnnouncement;
import java.util.List;

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
}
