package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrAttendanceAppealPayload;
import com.cloudflow.hr.domain.entity.HrAttendanceAppeal;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceAppealVO;
import com.cloudflow.hr.mapper.HrAttendanceAppealMapper;
import com.cloudflow.hr.mapper.HrAttendanceRecordMapper;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.service.IHrAttendanceAppealService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * HR-P1-4 考勤异常申诉实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrAttendanceAppealServiceImpl implements IHrAttendanceAppealService {

    private static final long TENANT_ID = 100000L;

    private final HrAttendanceAppealMapper appealMapper;
    private final HrAttendanceRecordMapper attendanceRecordMapper;
    private final HrAuditLogMapper auditLogMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public Long submit(HrAttendanceAppealPayload payload) {
        if (payload == null || payload.getEmployeeId() == null
                || payload.getAttendanceDate() == null || !StringUtils.hasText(payload.getExceptionType())) {
            throw new IllegalArgumentException("员工/考勤日期/异常类型不能为空");
        }
        if (!StringUtils.hasText(payload.getAppealNo())) {
            payload.setAppealNo(generateAppealNo());
        }
        if (!StringUtils.hasText(payload.getStatus())) {
            payload.setStatus("PENDING");
        }
        return crudService.create(HrAttendanceAppeal.class, payload);
    }

    @Override
    @Transactional
    public void managerReview(Long id, boolean pass, String remark) {
        HrAttendanceAppeal appeal = appealMapper.selectById(id);
        if (appeal == null || appeal.getDeleted() != null && appeal.getDeleted() == 1) {
            throw new IllegalArgumentException("申诉不存在");
        }
        if (!"PENDING".equalsIgnoreCase(appeal.getStatus())) {
            throw new IllegalStateException("仅 PENDING 状态可主管审核");
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("managerId", UserContext.getUserId());
        patch.put("managerRemark", remark);
        // 主管通过 → 待 HR 复核；驳回 → 直接 REJECTED
        patch.put("status", pass ? "PENDING" : "REJECTED");
        crudService.updateProperties(HrAttendanceAppeal.class, id, patch);
    }

    @Override
    @Transactional
    public void hrReview(Long id, String finalDecision, String remark) {
        HrAttendanceAppeal appeal = appealMapper.selectById(id);
        if (appeal == null || appeal.getDeleted() != null && appeal.getDeleted() == 1) {
            throw new IllegalArgumentException("申诉不存在");
        }
        if ("CANCELLED".equalsIgnoreCase(appeal.getStatus())) {
            throw new IllegalStateException("已撤回的申诉不可处理");
        }
        String decision = finalDecision == null ? "" : finalDecision.trim().toUpperCase(Locale.ROOT);
        if (!"REWRITE".equals(decision) && !"REJECT".equals(decision) && !"IGNORE".equals(decision)) {
            throw new IllegalArgumentException("finalDecision 仅允许 REWRITE/REJECT/IGNORE");
        }

        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("hrReviewerId", UserContext.getUserId());
        patch.put("hrRemark", remark);
        patch.put("finalDecision", decision);
        patch.put("decidedTime", LocalDateTime.now());
        if ("REWRITE".equals(decision)) {
            patch.put("status", "APPROVED");
            patch.put("approvedCheckIn", appeal.getExpectedCheckIn());
            patch.put("approvedCheckOut", appeal.getExpectedCheckOut());
            rewriteAttendanceRecord(appeal);
        } else if ("REJECT".equals(decision)) {
            patch.put("status", "REJECTED");
        } else {
            patch.put("status", "APPROVED");
        }
        crudService.updateProperties(HrAttendanceAppeal.class, id, patch);
    }

    @Override
    public void cancel(Long id) {
        HrAttendanceAppeal appeal = appealMapper.selectById(id);
        if (appeal == null) {
            return;
        }
        String s = appeal.getStatus();
        if (!"DRAFT".equalsIgnoreCase(s) && !"PENDING".equalsIgnoreCase(s)) {
            throw new IllegalStateException("当前状态不可撤回：" + s);
        }
        crudService.updateProperties(HrAttendanceAppeal.class, id, Map.of("status", "CANCELLED"));
    }

    @Override
    public HrAttendanceAppealVO getDetail(Long id) {
        Map<String, Object> row = crudService.get(HrAttendanceAppeal.class, id);
        if (row == null || row.isEmpty()) {
            return null;
        }
        return objectMapper.convertValue(row, HrAttendanceAppealVO.class);
    }

    private void rewriteAttendanceRecord(HrAttendanceAppeal appeal) {
        if (appeal.getAttendanceRecordId() == null) {
            log.warn("申诉 {} 无关联考勤记录，跳过改写", appeal.getId());
            return;
        }
        Map<String, Object> beforeRow = attendanceRecordMapper.selectRowAsMap(
                appeal.getAttendanceRecordId(), TENANT_ID);
        if (beforeRow == null || beforeRow.isEmpty()) {
            log.warn("申诉 {} 关联考勤记录 {} 不存在，跳过改写", appeal.getId(), appeal.getAttendanceRecordId());
            return;
        }
        int rows = attendanceRecordMapper.rewriteForAppeal(
                appeal.getAttendanceRecordId(),
                TENANT_ID,
                appeal.getExpectedCheckIn(),
                appeal.getExpectedCheckOut(),
                " [APPEAL_REWRITE id=" + appeal.getId() + "]",
                defaultOperator());
        if (rows == 0) {
            log.warn("申诉 {} 改写未命中记录 {}", appeal.getId(), appeal.getAttendanceRecordId());
            return;
        }
        writeAuditLog("hr_attendance_record", appeal.getAttendanceRecordId(), "APPEAL_REWRITE",
                beforeRow,
                Map.of("appealId", appeal.getId(),
                        "approvedCheckIn", String.valueOf(appeal.getExpectedCheckIn()),
                        "approvedCheckOut", String.valueOf(appeal.getExpectedCheckOut())));
    }

    private String generateAppealNo() {
        return "ATA" + System.currentTimeMillis();
    }

    private String defaultOperator() {
        String name = UserContext.getUserName();
        return StringUtils.hasText(name) ? name : "system";
    }

    private void writeAuditLog(String tableName, Long businessId, String operationType,
                               Map<String, Object> before, Map<String, Object> after) {
        try {
            auditLogMapper.insertLog(
                    TENANT_ID,
                    tableName,
                    businessId,
                    operationType,
                    UserContext.getUserId(),
                    defaultOperator(),
                    objectMapper.writeValueAsString(before == null ? Map.of() : before),
                    objectMapper.writeValueAsString(after == null ? Map.of() : after));
        } catch (Exception ignored) {
        }
    }
}
