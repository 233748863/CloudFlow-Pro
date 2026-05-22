package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrTrainingCertificate;
import com.cloudflow.hr.domain.entity.HrTrainingCourse;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrTrainingCertificateMapper;
import com.cloudflow.hr.mapper.HrTrainingCourseMapper;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrTrainingArchiveService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 培训档案聚合实现：按员工实时拼装培训记录 + 学时合计 + 证书列表。
 *
 * <p>不存物理表，每次按 employee_id + tenant_id 拉 hr_training_enrollment / hr_training_certificate，
 * 再 batch in 取 course / session 元数据合并到 VO。
 */
@Service
@RequiredArgsConstructor
public class HrTrainingArchiveServiceImpl implements HrTrainingArchiveService {

    private final HrTrainingEnrollmentMapper enrollmentMapper;
    private final HrTrainingCertificateMapper certificateMapper;
    private final HrTrainingCourseMapper courseMapper;
    private final HrTrainingSessionMapper sessionMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrEssSupport essSupport;

    @Override
    public Map<String, Object> mine() {
        return buildArchive(essSupport.currentEmployeeId());
    }

    @Override
    public Map<String, Object> forEmployee(Long employeeId) {
        return buildArchive(employeeId);
    }

    private Map<String, Object> buildArchive(Long employeeId) {
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
        List<Map<String, Object>> enrollmentRows = new ArrayList<>(enrollments.size());
        for (HrTrainingEnrollment e : enrollments) {
            HrTrainingSession s = e.getSessionId() == null ? null : sessionMap.get(e.getSessionId());
            HrTrainingCourse c = s == null || s.getCourseId() == null ? null : courseMap.get(s.getCourseId());
            String completion = String.valueOf(e.getCompletionStatus()).toUpperCase(Locale.ROOT);
            if ("PASSED".equals(completion)) {
                completedCount++;
                if (c != null && c.getCreditHours() != null) {
                    totalCredit = totalCredit.add(c.getCreditHours());
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

    private Long currentTenantId() {
        Long tid = TenantContext.getTenantId();
        if (tid != null) {
            return tid;
        }
        tid = UserContext.getTenantId();
        return tid == null ? 100000L : tid;
    }
}
