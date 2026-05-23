package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.OaMeetingMinutes;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.mapper.OaMeetingAttendanceMapper;
import com.cloudflow.oa.mapper.OaMeetingMinutesMapper;
import com.cloudflow.oa.service.IOaMeetingMinutesService;
import com.cloudflow.oa.service.IWorkTaskService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * OA-P1-2 会议纪要 + 出席记录实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaMeetingMinutesServiceImpl implements IOaMeetingMinutesService {

    private static final Long DEFAULT_TENANT_ID = 100000L;

    private final OaMeetingMinutesMapper minutesMapper;
    private final OaMeetingAttendanceMapper attendanceMapper;
    private final IWorkTaskService workTaskService;
    private final ObjectMapper objectMapper;

    @Override
    public Page<OaMeetingMinutes> page(String keyword, String status, Long meetingId, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<OaMeetingMinutes> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaMeetingMinutes::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.like(OaMeetingMinutes::getMeetingTitle, keyword);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(OaMeetingMinutes::getStatus, status);
        }
        if (meetingId != null) {
            wrapper.eq(OaMeetingMinutes::getMeetingId, meetingId);
        }
        wrapper.orderByDesc(OaMeetingMinutes::getMeetingTime)
                .orderByDesc(OaMeetingMinutes::getId);
        return minutesMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public OaMeetingMinutes getDetail(Long id) {
        if (id == null) {
            return null;
        }
        return minutesMapper.selectById(id);
    }

    @Override
    @Transactional
    public boolean save(OaMeetingMinutes minutes) {
        if (minutes == null) {
            throw new IllegalArgumentException("纪要不能为空");
        }
        if (minutes.getTenantId() == null) {
            minutes.setTenantId(DEFAULT_TENANT_ID);
        }
        if (!StringUtils.hasText(minutes.getStatus())) {
            minutes.setStatus("DRAFT");
        }
        if (!StringUtils.hasText(minutes.getOrganizerName())) {
            minutes.setOrganizerName(UserContext.getUserName());
            minutes.setOrganizerId(UserContext.getUserId());
        }
        minutes.setCreateBy(UserContext.getUserName());
        minutes.setUpdateBy(UserContext.getUserName());
        return minutesMapper.insert(minutes) > 0;
    }

    @Override
    @Transactional
    public boolean update(OaMeetingMinutes minutes) {
        if (minutes == null || minutes.getId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        minutes.setUpdateBy(UserContext.getUserName());
        minutes.setUpdateTime(LocalDateTime.now());
        return minutesMapper.updateById(minutes) > 0;
    }

    @Override
    @Transactional
    public boolean remove(Long id) {
        if (id == null) {
            return false;
        }
        OaMeetingMinutes exist = minutesMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setDeleted(1);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return minutesMapper.updateById(exist) > 0;
    }

    @Override
    @Transactional
    public boolean confirm(Long id) {
        OaMeetingMinutes exist = minutesMapper.selectById(id);
        if (exist == null || (exist.getDeleted() != null && exist.getDeleted() == 1)) {
            return false;
        }
        exist.setStatus("CONFIRMED");
        exist.setConfirmedTime(LocalDateTime.now());
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return minutesMapper.updateById(exist) > 0;
    }

    @Override
    public List<OaMeetingAttendance> listAttendance(Long minutesId) {
        if (minutesId == null) {
            return List.of();
        }
        return attendanceMapper.selectList(new LambdaQueryWrapper<OaMeetingAttendance>()
                .eq(OaMeetingAttendance::getMinutesId, minutesId)
                .eq(OaMeetingAttendance::getDeleted, 0)
                .orderByAsc(OaMeetingAttendance::getId));
    }

    @Override
    @Transactional
    public boolean upsertAttendance(OaMeetingAttendance attendance) {
        if (attendance == null || attendance.getMinutesId() == null || attendance.getUserId() == null) {
            throw new IllegalArgumentException("纪要ID与参会人ID必填");
        }
        if (attendance.getTenantId() == null) {
            attendance.setTenantId(DEFAULT_TENANT_ID);
        }
        if (!StringUtils.hasText(attendance.getAttendStatus())) {
            attendance.setAttendStatus("NOT_CHECKED");
        }
        OaMeetingAttendance exist = attendanceMapper.selectOne(new LambdaQueryWrapper<OaMeetingAttendance>()
                .eq(OaMeetingAttendance::getMinutesId, attendance.getMinutesId())
                .eq(OaMeetingAttendance::getUserId, attendance.getUserId())
                .eq(OaMeetingAttendance::getDeleted, 0)
                .last("LIMIT 1"));
        if (exist != null) {
            exist.setAttendStatus(attendance.getAttendStatus());
            exist.setCheckInTime(attendance.getCheckInTime());
            exist.setRemark(attendance.getRemark());
            exist.setUserName(attendance.getUserName());
            exist.setUpdateBy(UserContext.getUserName());
            exist.setUpdateTime(LocalDateTime.now());
            return attendanceMapper.updateById(exist) > 0;
        }
        attendance.setCreateBy(UserContext.getUserName());
        attendance.setUpdateBy(UserContext.getUserName());
        return attendanceMapper.insert(attendance) > 0;
    }

    @Override
    @Transactional
    public boolean removeAttendance(Long id) {
        if (id == null) {
            return false;
        }
        OaMeetingAttendance exist = attendanceMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setDeleted(1);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return attendanceMapper.updateById(exist) > 0;
    }

    @Override
    @Transactional
    public List<Long> dispatchDecisionsToWorkTasks(Long minutesId, List<Map<String, Object>> decisionOverrides) {
        OaMeetingMinutes minutes = minutesMapper.selectById(minutesId);
        if (minutes == null) {
            throw new IllegalArgumentException("纪要不存在: " + minutesId);
        }
        // 优先使用前端覆盖的 decisions 数组（用于一键派发前的微调），否则读库内已存的 JSON。
        List<Map<String, Object>> decisions = decisionOverrides;
        if (decisions == null || decisions.isEmpty()) {
            decisions = parseDecisionsJson(minutes.getDecisions());
        }
        if (decisions == null || decisions.isEmpty()) {
            return List.of();
        }
        List<Long> taskIds = new ArrayList<>();
        for (Map<String, Object> decision : decisions) {
            // 已派发过则跳过（幂等：decision.workTaskId 已存在则不再创建）
            Object existingTaskId = decision.get("workTaskId");
            if (existingTaskId != null) {
                taskIds.add(Long.valueOf(String.valueOf(existingTaskId)));
                continue;
            }
            WorkTask task = new WorkTask();
            task.setTenantId(minutes.getTenantId());
            task.setTitle(stringOrFallback(decision.get("title"), "会议决议项"));
            String description = stringOrFallback(decision.get("description"),
                    "来源会议: " + Objects.toString(minutes.getMeetingTitle(), "未命名"));
            task.setDescription(description);
            Long ownerId = parseLong(decision.get("ownerId"));
            if (ownerId == null) {
                ownerId = minutes.getOrganizerId();
            }
            task.setAssigneeId(ownerId);
            task.setOwnerId(minutes.getOrganizerId());
            task.setPriority(parseInt(decision.get("priority"), 1));
            task.setStatus("TODO");
            LocalDate deadline = parseDate(decision.get("deadline"));
            if (deadline != null) {
                task.setDueDate(deadline.atStartOfDay());
            }
            task.setCreateBy(UserContext.getUserName());
            task.setUpdateBy(UserContext.getUserName());
            task.setCreateTime(LocalDateTime.now());
            task.setUpdateTime(LocalDateTime.now());
            workTaskService.save(task);
            taskIds.add(task.getTaskId());
            decision.put("workTaskId", task.getTaskId());
            decision.put("status", "DISPATCHED");
        }
        // 回写决议 JSON，让前端读到 workTaskId
        try {
            minutes.setDecisions(objectMapper.writeValueAsString(decisions));
            minutes.setUpdateBy(UserContext.getUserName());
            minutes.setUpdateTime(LocalDateTime.now());
            minutesMapper.updateById(minutes);
        } catch (Exception e) {
            log.warn("回写 decisions 失败 minutesId={}", minutesId, e);
        }
        return taskIds;
    }

    private List<Map<String, Object>> parseDecisionsJson(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {
            });
        } catch (Exception e) {
            log.warn("解析 decisions JSON 失败: {}", json, e);
            return new ArrayList<>();
        }
    }

    private String stringOrFallback(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? fallback : s;
    }

    private Long parseLong(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (Exception ignored) {
            return null;
        }
    }

    private int parseInt(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ignored) {
            return defaultValue;
        }
    }

    private LocalDate parseDate(Object value) {
        if (value == null) {
            return null;
        }
        try {
            String s = String.valueOf(value).trim();
            if (s.isEmpty()) {
                return null;
            }
            // 兼容 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss
            return s.length() > 10
                    ? LocalDateTime.parse(s.replace(' ', 'T')).atZone(ZoneId.systemDefault()).toLocalDate()
                    : LocalDate.parse(s);
        } catch (Exception ignored) {
            // 留意：兜底返回 null 是为了避免一次坏值卡住整个一键派发，调用方仍可在 UI 提示
            return null;
        }
    }

    // 静态工具方法消除未读告警的占位（保持类内部 import 不被裁剪）
    @SuppressWarnings("unused")
    private void __unused__() {
        new LinkedHashMap<String, Object>();
    }
}
