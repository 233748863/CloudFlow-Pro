package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.SysAnnouncementRead;
import com.cloudflow.oa.mapper.SysAnnouncementMapper;
import com.cloudflow.oa.mapper.SysAnnouncementReadMapper;
import com.cloudflow.oa.service.ISysAnnouncementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Date;
import java.util.List;

import java.util.Set;
import java.util.HashSet;

@Service
public class SysAnnouncementServiceImpl extends ServiceImpl<SysAnnouncementMapper, SysAnnouncement> implements ISysAnnouncementService {

    @Autowired
    private SysAnnouncementReadMapper readMapper;

    @Override
    public List<SysAnnouncement> getMyAnnouncements(Long userId) {
        // 1. 获取部门ID，默认为 -1 (表示无部门)
        String deptId = String.valueOf(UserContext.getDeptId() != null ? UserContext.getDeptId() : -1L);
        
        // 2. 获取所有角色ID
        Set<String> roleIds = UserContext.getRoles();
        if (roleIds == null) {
            roleIds = new HashSet<>();
        }
        
        return baseMapper.getMyAnnouncements(userId, deptId, roleIds);
    }

    @Override
    @Transactional
    public boolean readAnnouncement(Long announcementId, Long userId) {
        // Check if already read
        // Add unique index constraint check or select first
        try {
            SysAnnouncementRead read = new SysAnnouncementRead();
            read.setAnnouncementId(announcementId);
            read.setUserId(userId);
            read.setReadTime(new Date());
            readMapper.insert(read);
            return true;
        } catch (Exception e) {
            // Duplicate key exception expected if already read
            return false;
        }
    }

    @Override
    public boolean publish(SysAnnouncement announcement) {
        announcement.setStatus("1"); // Published
        announcement.setCreateTime(new Date());
        return save(announcement);
    }
}
