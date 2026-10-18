package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrAttendanceAppealPayload;
import com.cloudflow.hr.domain.entity.HrAttendanceAppeal;
import com.cloudflow.hr.domain.entity.HrAttendanceRecord;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceAppealVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAttendanceAppealMapper;
import com.cloudflow.hr.mapper.HrAttendanceRecordMapper;
import com.cloudflow.hr.service.HrAttendanceBusinessService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.IHrAttendanceAppealService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrAttendanceAppealServiceImpl implements IHrAttendanceAppealService {
    private final HrAttendanceAppealMapper appealMapper;
    private final HrAttendanceRecordMapper attendanceRecordMapper;
    private final HrAttendanceBusinessService attendanceService;
    private final HrRuleSupport support;
    private final HrEssSupport essSupport;
    private final ObjectMapper objectMapper;

    @Override
    public List<HrAttendanceAppealVO> ownAppeals() {
        Long employeeId = essSupport.currentEmployeeId();
        return appealMapper.selectList(new LambdaQueryWrapper<HrAttendanceAppeal>()
                .eq(HrAttendanceAppeal::getTenantId, tenantId())
                .eq(HrAttendanceAppeal::getEmployeeId, employeeId)
                .eq(HrAttendanceAppeal::getDeleted, 0)
                .orderByDesc(HrAttendanceAppeal::getId)).stream()
                .map(appeal -> objectMapper.convertValue(appeal, HrAttendanceAppealVO.class)).toList();
    }

    @Override
    public Long submit(HrAttendanceAppealPayload payload) {
        if (payload == null || payload.getAttendanceDate() == null || payload.getAttendanceRecordId() == null
                || !StringUtils.hasText(payload.getExceptionType()) || !StringUtils.hasText(payload.getReason())) {
            throw new HrBusinessException("INVALID_APPEAL", "考勤日期、日结论、异常类型及申诉原因不能为空");
        }
        support.assertEmployeeScope(payload.getEmployeeId());
        return support.locked("attendance-appeal-submit:" + payload.getAttendanceRecordId(), () -> {
            HrAttendanceRecord record = attendanceRecordMapper.selectById(payload.getAttendanceRecordId());
            if (record == null || flag(record.getDeleted()) || !Objects.equals(record.getTenantId(), tenantId())
                    || !Objects.equals(record.getEmployeeId(), payload.getEmployeeId())
                    || !Objects.equals(record.getAttendanceDate(), payload.getAttendanceDate())) {
                throw new HrBusinessException("INVALID_APPEAL_RECORD", "申诉员工、日期与日考勤结论不匹配");
            }
            if (appealMapper.selectCount(new LambdaQueryWrapper<HrAttendanceAppeal>()
                    .eq(HrAttendanceAppeal::getTenantId, tenantId()).eq(HrAttendanceAppeal::getDeleted, 0)
                    .eq(HrAttendanceAppeal::getAttendanceRecordId, record.getId()).eq(HrAttendanceAppeal::getStatus, "PENDING")) > 0) {
                throw new HrBusinessException("APPEAL_PENDING", "该日考勤已有待处理申诉");
            }
            if (payload.getExpectedCheckIn() != null && payload.getExpectedCheckOut() != null
                    && !payload.getExpectedCheckOut().isAfter(payload.getExpectedCheckIn())) {
                throw new HrBusinessException("INVALID_APPEAL_TIME", "补卡下班时间须晚于上班时间");
            }
            HrEmployee employee = support.employee(payload.getEmployeeId());
            HrAttendanceAppeal appeal = new HrAttendanceAppeal();
            appeal.setTenantId(tenantId());
            appeal.setAppealNo("ATA" + UUID.randomUUID().toString().replace("-", ""));
            appeal.setEmployeeId(employee.getId());
            appeal.setEmployeeName(employee.getName());
            appeal.setDeptId(employee.getDeptId());
            appeal.setAttendanceRecordId(record.getId());
            appeal.setAttendanceDate(record.getAttendanceDate());
            appeal.setExceptionType(payload.getExceptionType());
            appeal.setReason(payload.getReason());
            appeal.setEvidenceUrls(payload.getEvidenceUrls());
            appeal.setExpectedCheckIn(payload.getExpectedCheckIn());
            appeal.setExpectedCheckOut(payload.getExpectedCheckOut());
            appeal.setStatus("PENDING");
            appeal.setDeleted(0); appeal.setVersion(0);
            appeal.setCreateBy(userName()); appeal.setUpdateBy(userName());
            appeal.setCreateTime(LocalDateTime.now()); appeal.setUpdateTime(LocalDateTime.now());
            appealMapper.insert(appeal);
            support.audit("ATTENDANCE_APPEAL", appeal.getId(), "SUBMIT", Map.of("recordId", record.getId()));
            return appeal.getId();
        });
    }

    @Override
    public void managerReview(Long id, boolean pass, String remark) {
        support.locked("attendance-appeal:" + id, () -> {
            HrAttendanceAppeal appeal = get(id);
            if (!"PENDING".equals(appeal.getStatus()) || appeal.getManagerId() != null) {
                throw new HrBusinessException("INVALID_APPEAL_STATE", "仅未审核的待处理申诉可主管审核");
            }
            appeal.setManagerId(UserContext.getUserId());
            appeal.setManagerRemark(remark);
            appeal.setStatus(pass ? "PENDING" : "REJECTED");
            update(appeal);
            support.audit("ATTENDANCE_APPEAL", id, "MANAGER_REVIEW", Map.of("pass", pass));
            return null;
        });
    }

    @Override
    public void hrReview(Long id, String finalDecision, String remark) {
        String decision = finalDecision == null ? "" : finalDecision.trim().toUpperCase(Locale.ROOT);
        if (!List.of("REWRITE", "REJECT", "IGNORE").contains(decision)) {
            throw new HrBusinessException("INVALID_APPEAL_DECISION", "最终决定须为REWRITE/REJECT/IGNORE");
        }
        support.locked("attendance-appeal:" + id, () -> {
            HrAttendanceAppeal appeal = get(id);
            if (decision.equals(appeal.getFinalDecision()) && List.of("APPROVED", "REJECTED").contains(appeal.getStatus())) return null;
            if (!"PENDING".equals(appeal.getStatus()) || appeal.getManagerId() == null) {
                throw new HrBusinessException("INVALID_APPEAL_STATE", "仅主管通过的待处理申诉可由HR复核");
            }
            if ("REWRITE".equals(decision)) {
                attendanceService.applyAppeal(appeal);
                appeal.setApprovedCheckIn(appeal.getExpectedCheckIn());
                appeal.setApprovedCheckOut(appeal.getExpectedCheckOut());
            }
            appeal.setHrReviewerId(UserContext.getUserId());
            appeal.setHrRemark(remark);
            appeal.setFinalDecision(decision);
            appeal.setDecidedTime(LocalDateTime.now());
            appeal.setStatus("REJECT".equals(decision) ? "REJECTED" : "APPROVED");
            update(appeal);
            support.audit("ATTENDANCE_APPEAL", id, "HR_REVIEW", Map.of("decision", decision));
            return null;
        });
    }

    @Override
    @Audit(name = "取消考勤申诉", highRisk = true)
    public void cancel(Long id) {
        support.locked("attendance-appeal:" + id, () -> {
            HrAttendanceAppeal appeal = get(id);
            essSupport.assertOwner(appeal.getEmployeeId());
            if ("CANCELLED".equals(appeal.getStatus())) return null;
            if (!List.of("DRAFT", "PENDING").contains(appeal.getStatus())) throw new HrBusinessException("INVALID_APPEAL_STATE", "当前状态不可撤回");
            appeal.setStatus("CANCELLED");
            update(appeal);
            support.audit("ATTENDANCE_APPEAL", id, "CANCEL", Map.of());
            return null;
        });
    }

    @Override
    public HrAttendanceAppealVO getDetail(Long id) {
        return objectMapper.convertValue(get(id), HrAttendanceAppealVO.class);
    }

    private HrAttendanceAppeal get(Long id) {
        HrAttendanceAppeal appeal = id == null ? null : appealMapper.selectById(id);
        if (appeal == null || flag(appeal.getDeleted()) || !Objects.equals(tenantId(), appeal.getTenantId())) {
            throw new HrBusinessException("APPEAL_NOT_FOUND", "考勤申诉不存在");
        }
        support.assertEmployeeScope(appeal.getEmployeeId());
        return appeal;
    }

    private void update(HrAttendanceAppeal appeal) {
        appeal.setUpdateBy(userName()); appeal.setUpdateTime(LocalDateTime.now());
        if (appealMapper.updateById(appeal) != 1) throw new HrBusinessException("APPEAL_CONFLICT", "申诉状态已变更，请刷新");
    }
}
