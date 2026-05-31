package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.SysAnnouncementRead;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.mapper.SysAnnouncementMapper;
import com.cloudflow.oa.mapper.SysAnnouncementReadMapper;
import com.cloudflow.oa.service.ISysAnnouncementService;
import com.cloudflow.common.audit.annotation.Audit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.util.*;

@Service
public class SysAnnouncementServiceImpl extends ServiceImpl<SysAnnouncementMapper, SysAnnouncement> implements ISysAnnouncementService {

    private static final String WORKPLACE_SUMMARY_CACHE = "oa_workplace_summary#120s";

    @Autowired
    private SysAnnouncementReadMapper readMapper;

    @Override
    public List<SysAnnouncement> getMyAnnouncements(Long userId) {
        String deptId = String.valueOf(UserContext.getDeptId() != null ? UserContext.getDeptId() : -1L);
        Set<String> roleIds = UserContext.getRoles();
        if (roleIds == null) {
            roleIds = new HashSet<>();
        }
        return baseMapper.getMyAnnouncements(userId, deptId, roleIds);
    }

    @Override
    public List<SysAnnouncement> getPublicAnnouncements(Integer limit) {
        int pageSize = limit == null ? 20 : Math.min(Math.max(limit, 1), 50);
        Page<SysAnnouncement> pageParam = new Page<>(1, pageSize, false);
        LambdaQueryWrapper<SysAnnouncement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysAnnouncement::getDeleted, 0)
                .eq(SysAnnouncement::getStatus, "1")
                .eq(SysAnnouncement::getScopeType, "ALL")
                .and(w -> w.isNull(SysAnnouncement::getExpireTime)
                        .or()
                        .gt(SysAnnouncement::getExpireTime, LocalDateTime.now()))
                .orderByDesc(SysAnnouncement::getIsTop, SysAnnouncement::getCreateTime);
        List<SysAnnouncement> records = page(pageParam, wrapper).getRecords();
        records.forEach(item -> item.setIsRead(Boolean.FALSE));
        return records;
    }

    @Override
    @Transactional
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, key = "#userId")
    public boolean readAnnouncement(Long announcementId, Long userId) {
        // Check if already read
        // Add unique index constraint check or select first
        try {
            SysAnnouncementRead read = new SysAnnouncementRead();
            read.setAnnouncementId(announcementId);
            read.setUserId(userId);
            read.setReadTime(LocalDateTime.now());
            readMapper.insert(read);
            return true;
        } catch (Exception e) {
            // Duplicate key exception expected if already read
            return false;
        }
    }

    @Override
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, allEntries = true)
    public boolean publish(SysAnnouncement announcement) {
        announcement.setStatus("1"); // Published
        announcement.setPublishTime(LocalDateTime.now());
        announcement.setCreateTime(LocalDateTime.now());
        return save(announcement);
    }
    
    @Override
    public DynamicMapVO getManageList(String title, String type, String status, Integer page, Integer size) {
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
        
        wrapper.eq(SysAnnouncement::getDeleted, "0");
        wrapper.orderByDesc(SysAnnouncement::getIsTop, SysAnnouncement::getCreateTime);
        
        IPage<SysAnnouncement> result = page(pageParam, wrapper);
        
        Map<String, Object> response = new HashMap<>();
        response.put("list", result.getRecords());
        response.put("total", result.getTotal());
        response.put("page", result.getCurrent());
        response.put("size", result.getSize());

        return DynamicMapVO.from(response);
    }
    
    @Override
    @Transactional
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, allEntries = true)
    @Audit(name = "更新公告")
    public boolean updateAnnouncement(SysAnnouncement announcement) {
        announcement.setUpdateTime(LocalDateTime.now());
        return updateById(announcement);
    }
    
    @Override
    @Transactional
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, allEntries = true)
    public boolean revokeAnnouncement(Long announcementId) {
        SysAnnouncement announcement = getById(announcementId);
        if (announcement != null && "1".equals(announcement.getStatus())) {
            announcement.setStatus("2"); // 已撤销
            announcement.setUpdateTime(LocalDateTime.now());
            return updateById(announcement);
        }
        return false;
    }
    
    @Override
    @Transactional
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, allEntries = true)
    public boolean toggleTop(Long announcementId) {
        SysAnnouncement announcement = getById(announcementId);
        if (announcement != null) {
            announcement.setIsTop(announcement.getIsTop() == 1 ? 0 : 1);
            announcement.setUpdateTime(LocalDateTime.now());
            return updateById(announcement);
        }
        return false;
    }
    
    @Override
    public DynamicMapVO getReadStats(Long announcementId) {
        // 获取已读记录
        LambdaQueryWrapper<SysAnnouncementRead> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysAnnouncementRead::getAnnouncementId, announcementId);
        List<SysAnnouncementRead> readRecords = readMapper.selectList(wrapper);

        Map<String, Object> stats = new HashMap<>();
        stats.put("readCount", readRecords.size());
        stats.put("readUsers", readRecords);

        return DynamicMapVO.from(stats);
    }
}
