package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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
import org.springframework.util.StringUtils;
import java.util.*;

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
        announcement.setPublishTime(new Date());
        announcement.setCreateTime(new Date());
        return save(announcement);
    }
    
    @Override
    public Map<String, Object> getManageList(String title, String type, String status, Integer page, Integer size) {
        Page<SysAnnouncement> pageParam = new Page<>(page, size);
        LambdaQueryWrapper<SysAnnouncement> wrapper = new LambdaQueryWrapper<>();
        
        if (StringUtils.hasText(title)) {
            wrapper.like(SysAnnouncement::getTitle, title);
        }
        if (StringUtils.hasText(type)) {
            wrapper.eq(SysAnnouncement::getType, type);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(SysAnnouncement::getStatus, status);
        }
        
        wrapper.eq(SysAnnouncement::getDelFlag, "0");
        wrapper.orderByDesc(SysAnnouncement::getIsTop, SysAnnouncement::getCreateTime);
        
        IPage<SysAnnouncement> result = page(pageParam, wrapper);
        
        Map<String, Object> response = new HashMap<>();
        response.put("list", result.getRecords());
        response.put("total", result.getTotal());
        response.put("page", result.getCurrent());
        response.put("size", result.getSize());
        
        return response;
    }
    
    @Override
    @Transactional
    public boolean updateAnnouncement(SysAnnouncement announcement) {
        announcement.setUpdateTime(new Date());
        return updateById(announcement);
    }
    
    @Override
    @Transactional
    public boolean revokeAnnouncement(Long announcementId) {
        SysAnnouncement announcement = getById(announcementId);
        if (announcement != null && "1".equals(announcement.getStatus())) {
            announcement.setStatus("2"); // 已撤销
            announcement.setUpdateTime(new Date());
            return updateById(announcement);
        }
        return false;
    }
    
    @Override
    @Transactional
    public boolean toggleTop(Long announcementId) {
        SysAnnouncement announcement = getById(announcementId);
        if (announcement != null) {
            announcement.setIsTop(announcement.getIsTop() == 1 ? 0 : 1);
            announcement.setUpdateTime(new Date());
            return updateById(announcement);
        }
        return false;
    }
    
    @Override
    public Map<String, Object> getReadStats(Long announcementId) {
        // 获取已读记录
        LambdaQueryWrapper<SysAnnouncementRead> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysAnnouncementRead::getAnnouncementId, announcementId);
        List<SysAnnouncementRead> readRecords = readMapper.selectList(wrapper);
        
        Map<String, Object> stats = new HashMap<>();
        stats.put("readCount", readRecords.size());
        stats.put("readUsers", readRecords);
        
        return stats;
    }
}
