package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class SysAnnouncementServiceImpl extends ServiceImpl<SysAnnouncementMapper, SysAnnouncement> implements ISysAnnouncementService {

    private static final String WORKPLACE_SUMMARY_CACHE = "oa_workplace_summary_core#60s";

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
        SysAnnouncement announcement = getById(announcementId);
        Long tenantId = announcement != null ? announcement.getTenantId() : UserContext.getTenantId();
        try {
            SysAnnouncementRead read = new SysAnnouncementRead();
            read.setTenantId(tenantId);
            read.setAnnouncementId(announcementId);
            read.setUserId(userId);
            read.setReadTime(LocalDateTime.now());
            readMapper.insert(read);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, allEntries = true)
    public boolean publish(SysAnnouncement announcement) {
        normalizeAnnouncementScope(announcement);
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
    @Audit(name = "更新公告", highRisk = true)
    public boolean updateAnnouncement(SysAnnouncement announcement) {
        normalizeAnnouncementScope(announcement);
        announcement.setUpdateTime(LocalDateTime.now());
        return updateById(announcement);
    }
    
    @Override
    @Transactional
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, allEntries = true)
    @Audit(name = "撤回公告", highRisk = true)
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
        SysAnnouncement announcement = requireAnnouncement(announcementId);
        List<SysAnnouncementRead> readRecords = readMapper.selectList(new LambdaQueryWrapper<SysAnnouncementRead>()
                .eq(SysAnnouncementRead::getAnnouncementId, announcementId)
                .eq(announcement.getTenantId() != null, SysAnnouncementRead::getTenantId, announcement.getTenantId())
                .orderByDesc(SysAnnouncementRead::getReadTime));
        List<Map<String, Object>> expectedUsers = selectExpectedReaders(announcement);
        Map<Long, Map<String, Object>> expectedByUserId = expectedUsers.stream()
                .map(this::copyRow)
                .filter(row -> mapUserId(row) != null)
                .collect(Collectors.toMap(
                        row -> Objects.requireNonNull(mapUserId(row)),
                        row -> row,
                        (left, right) -> left,
                        LinkedHashMap::new
                ));
        Set<Long> readUserIds = new LinkedHashSet<>();
        List<Map<String, Object>> readUsers = new ArrayList<>();
        for (SysAnnouncementRead readRecord : readRecords) {
            Long userId = readRecord.getUserId();
            if (userId == null || !readUserIds.add(userId)) {
                continue;
            }
            Map<String, Object> row = expectedByUserId.containsKey(userId)
                    ? new LinkedHashMap<>(expectedByUserId.get(userId))
                    : new LinkedHashMap<>();
            row.put("userId", userId);
            row.putIfAbsent("userName", "");
            row.putIfAbsent("nickName", "");
            row.putIfAbsent("deptName", "");
            row.put("readTime", readRecord.getReadTime());
            readUsers.add(row);
        }
        List<Map<String, Object>> unreadUsers = expectedUsers.stream()
                .map(this::copyRow)
                .filter(row -> {
                    Long userId = mapUserId(row);
                    return userId != null && !readUserIds.contains(userId);
                })
                .collect(Collectors.toList());
        Map<String, Object> stats = new HashMap<>();
        stats.put("expectedCount", expectedUsers.size());
        stats.put("readCount", readUsers.size());
        stats.put("unreadCount", unreadUsers.size());
        stats.put("readUsers", readUsers);
        stats.put("unreadUsers", unreadUsers);
        return DynamicMapVO.from(stats);
    }

    private SysAnnouncement requireAnnouncement(Long announcementId) {
        SysAnnouncement announcement = getById(announcementId);
        if (announcement == null || !Integer.valueOf(0).equals(announcement.getDeleted())) {
            throw new IllegalArgumentException("公告不存在");
        }
        return announcement;
    }

    private void normalizeAnnouncementScope(SysAnnouncement announcement) {
        if (announcement == null) {
            throw new IllegalArgumentException("公告不能为空");
        }
        if (!StringUtils.hasText(announcement.getScopeType())) {
            announcement.setScopeType("ALL");
        }
        if ("ALL".equalsIgnoreCase(announcement.getScopeType())) {
            announcement.setScopeValue(null);
            return;
        }
        List<String> scopeValues = parseScopeValues(announcement.getScopeValue());
        if (scopeValues.isEmpty()) {
            throw new IllegalArgumentException("定向发布范围不能为空");
        }
        announcement.setScopeValue(String.join(",", scopeValues));
    }

    private List<Map<String, Object>> selectExpectedReaders(SysAnnouncement announcement) {
        if ("ALL".equalsIgnoreCase(announcement.getScopeType())) {
            return normalizeUserRows(baseMapper.selectExpectedReaders(announcement.getTenantId(), "ALL", Collections.emptyList()));
        }
        List<String> scopeValues = parseScopeValues(announcement.getScopeValue());
        if (scopeValues.isEmpty()) {
            return Collections.emptyList();
        }
        return normalizeUserRows(baseMapper.selectExpectedReaders(
                announcement.getTenantId(),
                announcement.getScopeType(),
                scopeValues
        ));
    }

    private List<String> parseScopeValues(String scopeValue) {
        if (!StringUtils.hasText(scopeValue)) {
            return Collections.emptyList();
        }
        Set<String> values = new LinkedHashSet<>();
        for (String value : scopeValue.split(",")) {
            if (StringUtils.hasText(value)) {
                values.add(value.trim());
            }
        }
        return new ArrayList<>(values);
    }

    private List<Map<String, Object>> normalizeUserRows(List<Map<String, Object>> rows) {
        List<Map<String, Object>> result = new ArrayList<>();
        Set<Long> seenUserIds = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            Long userId = mapUserId(row);
            if (userId == null || !seenUserIds.add(userId)) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("userId", userId);
            item.put("userName", stringValue(rowValue(row, "userName", "user_name", "USER_NAME")));
            item.put("nickName", stringValue(rowValue(row, "nickName", "nick_name", "NICK_NAME")));
            item.put("deptName", stringValue(rowValue(row, "deptName", "dept_name", "DEPT_NAME")));
            result.add(item);
        }
        return result;
    }

    private Map<String, Object> copyRow(Map<String, Object> row) {
        return new LinkedHashMap<>(row);
    }

    private Long mapUserId(Map<String, Object> row) {
        Object value = rowValue(row, "userId", "user_id", "USER_ID");
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value != null && StringUtils.hasText(String.valueOf(value))) {
            return Long.valueOf(String.valueOf(value));
        }
        return null;
    }

    private Object rowValue(Map<String, Object> row, String... keys) {
        for (String key : keys) {
            if (row.containsKey(key)) {
                return row.get(key);
            }
        }
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            for (String key : keys) {
                if (entry.getKey().equalsIgnoreCase(key)) {
                    return entry.getValue();
                }
            }
        }
        return null;
    }

    private String stringValue(Object value) {
        return value != null ? String.valueOf(value) : "";
    }
}
