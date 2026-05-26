package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import java.util.List;

public interface ISysAnnouncementService extends IService<SysAnnouncement> {
    
    /**
     * 获取我的公告列表
     */
    List<SysAnnouncement> getMyAnnouncements(Long userId);

    /**
     * 获取匿名公开公告列表
     */
    List<SysAnnouncement> getPublicAnnouncements(Integer limit);
    
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
    DynamicMapVO getManageList(String title, String type, String status, Integer page, Integer size);
    
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
    DynamicMapVO getReadStats(Long announcementId);
}
