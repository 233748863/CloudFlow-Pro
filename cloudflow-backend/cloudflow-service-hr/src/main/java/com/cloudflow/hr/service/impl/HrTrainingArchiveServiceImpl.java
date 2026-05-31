package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrTrainingArchive;
import com.cloudflow.hr.domain.entity.HrTrainingCertificate;
import com.cloudflow.hr.domain.entity.HrTrainingCourse;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrTrainingArchiveMapper;
import com.cloudflow.hr.mapper.HrTrainingCertificateMapper;
import com.cloudflow.hr.mapper.HrTrainingCourseMapper;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.IHrTrainingArchiveService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * HR-P0-1 培训档案物理化实现。
 *
 * <p>读路径: 先查 hr_training_archive 物理表; 未命中则回退到旧实时聚合(buildArchiveRealtime),
 * 命中后异步触发 rebuildOne 把结果落表给下次读使用。
 *
 * <p>写路径: 报名 / 证书状态变更点调用 incrementOnXxxChange — @Async 全量重算单员工 + upsert。
 *
 * <p>兜底: TrainingArchiveRebuildJob 每天 02:30 调 rebuildAll 矫正所有数据漂移。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrTrainingArchiveServiceImpl implements IHrTrainingArchiveService {

    private final HrTrainingEnrollmentMapper enrollmentMapper;
    private final HrTrainingCertificateMapper certificateMapper;
    private final HrTrainingCourseMapper courseMapper;
    private final HrTrainingSessionMapper sessionMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrTrainingArchiveMapper archiveMapper;
    private final HrEssSupport essSupport;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public Map<String, Object> mine() {
        return buildArchive(essSupport.currentEmployeeId());
    }

    @Override
    public Map<String, Object> forEmployee(Long employeeId) {
        return buildArchive(employeeId);
    }

    private Map<String, Object> buildArchive(Long employeeId) {
        // 读路径优先查物理表的总计字段供前端首屏快显, 详情列表仍按需聚合(明细字段未持久化)
        Map<String, Object> result = buildArchiveRealtime(employeeId);
        if (employeeId != null) {
            HrTrainingArchive cached = findArchive(employeeId);
            if (cached != null) {
                result.put("totalCreditHours", cached.getTotalHours());
                result.put("completedCount", cached.getCompletionCount());
                result.put("ongoingCount", cached.getOngoingCount());
                result.put("certificateCount", cached.getCertCount());
                result.put("lastTrainingDate", cached.getLastTrainingDate());
                result.put("yearHours", parseYearHours(cached.getYearHours()));
                result.put("refreshedAt", cached.getRefreshedAt());
            } else {
                // 物理表未命中: 异步触发一次重算, 下次读即可走缓存
                try {
                    rebuildOne(employeeId);
                } catch (Exception e) {
                    log.warn("hr_training_archive 首次落表失败, employeeId={}", employeeId, e);
                }
            }
        }
        return result;
    }

    @Override
    @Async
    public void incrementOnEnrollmentChange(Long employeeId) {
        if (employeeId == null) {
            return;
        }
        try {
            rebuildOne(employeeId);
        } catch (Exception e) {
            log.warn("培训档案增量刷新失败(报名变更), employeeId={}", employeeId, e);
        }
    }

    @Override
    @Async
    public void incrementOnCertificateChange(Long employeeId) {
        if (employeeId == null) {
            return;
        }
        try {
            rebuildOne(employeeId);
        } catch (Exception e) {
            log.warn("培训档案增量刷新失败(证书变更), employeeId={}", employeeId, e);
        }
    }

    @Override
    public void rebuildOne(Long employeeId) {
        if (employeeId == null) {
            return;
        }
        Long tenantId = currentTenantId();
        Map<String, Object> agg = buildArchiveRealtime(employeeId);
        HrTrainingArchive archive = findArchive(employeeId);
        boolean isNew = archive == null;
        if (isNew) {
            archive = new HrTrainingArchive();
            archive.setTenantId(tenantId);
            archive.setEmployeeId(employeeId);
            archive.setCreateBy(resolveUserName());
            archive.setCreateTime(LocalDateTime.now());
        }
        archive.setTotalHours(toBigDecimal(agg.get("totalCreditHours")));
        archive.setCompletionCount(toInt(agg.get("completedCount")));
        archive.setOngoingCount(toInt(agg.get("ongoingCount")));
        archive.setCertCount(toInt(agg.get("certificateCount")));
        archive.setLastTrainingDate(resolveLastTrainingDate(agg));
        archive.setYearHours(serializeYearHours(agg));
        archive.setRefreshedAt(LocalDateTime.now());
        archive.setUpdateBy(resolveUserName());
        archive.setUpdateTime(LocalDateTime.now());
        if (isNew) {
            archive.setDeleted(0);
            archiveMapper.insert(archive);
        } else {
            archiveMapper.updateById(archive);
        }
    }

    @Override
    public int rebuildAll() {
        Long tenantId = currentTenantId();
        // 取该租户下所有员工 ID(只取 id 单列, 避免大对象内存压力)
        LambdaQueryWrapper<HrEmployee> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(HrEmployee::getTenantId, tenantId).eq(HrEmployee::getDeleted, 0)
                .select(HrEmployee::getId);
        List<HrEmployee> employees = employeeMapper.selectList(wrapper);
        int count = 0;
        for (HrEmployee e : employees) {
            if (e.getId() == null) {
                continue;
            }
            try {
                rebuildOne(e.getId());
                count++;
            } catch (Exception ex) {
                log.warn("培训档案全量重建失败, employeeId={}", e.getId(), ex);
            }
        }
        log.info("HR-P0-1 hr_training_archive 全量重建完成, tenantId={}, 处理={}/{} ", tenantId, count, employees.size());
        return count;
    }

    private HrTrainingArchive findArchive(Long employeeId) {
        LambdaQueryWrapper<HrTrainingArchive> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(HrTrainingArchive::getTenantId, currentTenantId())
                .eq(HrTrainingArchive::getEmployeeId, employeeId)
                .last("LIMIT 1");
        return archiveMapper.selectOne(wrapper);
    }

    private Map<String, Object> buildArchiveRealtime(Long employeeId) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (employeeId == null) {
            result.put("employee", Map.of());
            result.put("totalCreditHours", BigDecimal.ZERO);
            result.put("completedCount", 0);
            result.put("ongoingCount", 0);
            result.put("certificateCount", 0);
            result.put("enrollments", List.of());
            result.put("certificates", List.of());
            return result;
        }

        Long tenantId = currentTenantId();
        HrEmployee employee = employeeMapper.selectById(employeeId);

        QueryWrapper<HrTrainingEnrollment> enrollQuery = new QueryWrapper<>();
        enrollQuery.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("deleted", 0)
                .orderByDesc("update_time");
        List<HrTrainingEnrollment> enrollments = enrollmentMapper.selectList(enrollQuery);

        QueryWrapper<HrTrainingCertificate> certQuery = new QueryWrapper<>();
        certQuery.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("deleted", 0)
                .orderByDesc("issue_date");
        List<HrTrainingCertificate> certificates = certificateMapper.selectList(certQuery);

        Set<Long> sessionIds = enrollments.stream()
                .map(HrTrainingEnrollment::getSessionId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, HrTrainingSession> sessionMap = loadSessions(sessionIds);

        Set<Long> courseIds = sessionMap.values().stream()
                .map(HrTrainingSession::getCourseId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
        certificates.forEach(c -> {
            if (c.getCourseId() != null) {
                courseIds.add(c.getCourseId());
            }
        });
        Map<Long, HrTrainingCourse> courseMap = loadCourses(courseIds);

        BigDecimal totalCredit = BigDecimal.ZERO;
        int completedCount = 0;
        int ongoingCount = 0;
        Map<Integer, BigDecimal> yearHoursMap = new TreeMap<>();
        LocalDate lastTrainingDate = null;
        List<Map<String, Object>> enrollmentRows = new ArrayList<>(enrollments.size());
        for (HrTrainingEnrollment e : enrollments) {
            HrTrainingSession s = e.getSessionId() == null ? null : sessionMap.get(e.getSessionId());
            HrTrainingCourse c = s == null || s.getCourseId() == null ? null : courseMap.get(s.getCourseId());
            String completion = String.valueOf(e.getCompletionStatus()).toUpperCase(Locale.ROOT);
            if ("PASSED".equals(completion)) {
                completedCount++;
                if (c != null && c.getCreditHours() != null) {
                    totalCredit = totalCredit.add(c.getCreditHours());
                    if (s != null && s.getStartTime() != null) {
                        int year = s.getStartTime().getYear();
                        yearHoursMap.merge(year, c.getCreditHours(), BigDecimal::add);
                    }
                }
                if (s != null && s.getStartTime() != null) {
                    LocalDate sessionDate = s.getStartTime().toLocalDate();
                    if (lastTrainingDate == null || sessionDate.isAfter(lastTrainingDate)) {
                        lastTrainingDate = sessionDate;
                    }
                }
            } else if ("PENDING".equals(completion) && "APPROVED".equalsIgnoreCase(String.valueOf(e.getStatus()))) {
                ongoingCount++;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("enrollmentId", e.getId());
            row.put("sessionId", e.getSessionId());
            row.put("status", e.getStatus());
            row.put("completionStatus", e.getCompletionStatus());
            row.put("score", e.getScore());
            row.put("attended", e.getAttended());
            row.put("checkInTime", e.getCheckInTime());
            row.put("courseId", c == null ? null : c.getId());
            row.put("courseName", c == null ? null : c.getCourseName());
            row.put("courseCode", c == null ? null : c.getCourseCode());
            row.put("creditHours", c == null ? null : c.getCreditHours());
            row.put("sessionStartTime", s == null ? null : s.getStartTime());
            row.put("sessionEndTime", s == null ? null : s.getEndTime());
            row.put("location", s == null ? null : s.getLocation());
            enrollmentRows.add(row);
        }

        List<Map<String, Object>> certificateRows = new ArrayList<>(certificates.size());
        int validCertCount = 0;
        for (HrTrainingCertificate cert : certificates) {
            HrTrainingCourse c = cert.getCourseId() == null ? null : courseMap.get(cert.getCourseId());
            if ("VALID".equalsIgnoreCase(cert.getStatus())) {
                validCertCount++;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", cert.getId());
            row.put("certNo", cert.getCertNo());
            row.put("courseId", cert.getCourseId());
            row.put("courseName", c == null ? null : c.getCourseName());
            row.put("sessionId", cert.getSessionId());
            row.put("issueDate", cert.getIssueDate());
            row.put("expireDate", cert.getExpireDate());
            row.put("status", cert.getStatus());
            row.put("pdfFileId", cert.getPdfFileId());
            certificateRows.add(row);
        }

        Map<String, Object> employeeView = new LinkedHashMap<>();
        if (employee != null) {
            employeeView.put("id", employee.getId());
            employeeView.put("employeeNo", employee.getEmployeeNo());
            employeeView.put("name", employee.getName());
            employeeView.put("deptId", employee.getDeptId());
            employeeView.put("positionId", employee.getPositionId());
        }

        result.put("employee", employeeView);
        result.put("totalCreditHours", totalCredit);
        result.put("completedCount", completedCount);
        result.put("ongoingCount", ongoingCount);
        result.put("certificateCount", validCertCount);
        result.put("enrollments", enrollmentRows);
        result.put("certificates", certificateRows);
        result.put("lastTrainingDate", lastTrainingDate);
        result.put("yearHoursMap", yearHoursMap);
        return result;
    }

    private Map<Long, HrTrainingSession> loadSessions(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyMap();
        }
        QueryWrapper<HrTrainingSession> wrapper = new QueryWrapper<>();
        wrapper.in("id", ids);
        Map<Long, HrTrainingSession> map = new HashMap<>(ids.size() * 2);
        for (HrTrainingSession s : sessionMapper.selectList(wrapper)) {
            map.put(s.getId(), s);
        }
        return map;
    }

    private Map<Long, HrTrainingCourse> loadCourses(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyMap();
        }
        QueryWrapper<HrTrainingCourse> wrapper = new QueryWrapper<>();
        wrapper.in("id", ids);
        Map<Long, HrTrainingCourse> map = new HashMap<>(ids.size() * 2);
        for (HrTrainingCourse c : courseMapper.selectList(wrapper)) {
            map.put(c.getId(), c);
        }
        return map;
    }

    @SuppressWarnings("unchecked")
    private LocalDate resolveLastTrainingDate(Map<String, Object> agg) {
        Object v = agg.get("lastTrainingDate");
        return v instanceof LocalDate ? (LocalDate) v : null;
    }

    @SuppressWarnings("unchecked")
    private String serializeYearHours(Map<String, Object> agg) {
        Object v = agg.get("yearHoursMap");
        if (!(v instanceof Map<?, ?> map) || map.isEmpty()) {
            return null;
        }
        try {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : map.entrySet()) {
                out.put(String.valueOf(e.getKey()), e.getValue());
            }
            return JSON.writeValueAsString(out);
        } catch (Exception ex) {
            log.warn("yearHours 序列化失败", ex);
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseYearHours(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            return JSON.readValue(json, Map.class);
        } catch (Exception e) {
            log.warn("yearHours 反序列化失败: {}", json, e);
            return Collections.emptyMap();
        }
    }

    private BigDecimal toBigDecimal(Object v) {
        if (v instanceof BigDecimal bd) {
            return bd;
        }
        if (v instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        return BigDecimal.ZERO;
    }

    private int toInt(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        return 0;
    }

    private String resolveUserName() {
        try {
            String n = UserContext.getUserName();
            return n == null || n.isBlank() ? "system" : n;
        } catch (Exception e) {
            return "system";
        }
    }

    private Long currentTenantId() {
        Long tid = TenantContext.getTenantId();
        if (tid != null) {
            return tid;
        }
        tid = UserContext.getTenantId();
        return tid == null ? 100000L : tid;
    }
}
