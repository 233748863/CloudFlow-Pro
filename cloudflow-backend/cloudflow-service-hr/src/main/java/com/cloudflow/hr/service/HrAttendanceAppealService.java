package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrAttendanceAppealPayload;

import java.util.Map;

/**
 * HR-P1-4 考勤异常申诉服务。
 *
 * <p>申诉 → 直属领导审核 → HR 复核 → 命中 REWRITE 时改写 hr_attendance_record。
 * 工作流通过 businessType=HR_ATTENDANCE_APPEAL 走通用回调，本服务负责本地状态机与考勤记录改写。
 */
public interface HrAttendanceAppealService {

    /** 提交申诉，自动生成 appeal_no。 */
    Long submit(HrAttendanceAppealPayload payload);

    /** 主管审核（PENDING → APPROVED/REJECTED 之主管侧记录）。 */
    void managerReview(Long id, boolean pass, String remark);

    /** HR 复核 + 最终判定（REWRITE 时改写 hr_attendance_record）。 */
    void hrReview(Long id, String finalDecision, String remark);

    /** 申请人撤回（仅 DRAFT/PENDING 可撤回）。 */
    void cancel(Long id);

    Map<String, Object> getDetail(Long id);
}
