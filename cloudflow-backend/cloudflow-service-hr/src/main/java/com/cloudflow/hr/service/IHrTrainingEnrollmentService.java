package com.cloudflow.hr.service;

/**
 * 培训报名服务。员工 ESS 端报名 → 走 wf_hr_training_enrollment → APPROVED 后
 * {@link com.cloudflow.hr.service.impl.HrWorkflowCallbackServiceImpl} 触发 enrolled_count++。
 *
 * <p>容量校验在报名入口同步执行（{@code hr_training_session.enrolled_count >= capacity} 拒绝）；
 * 后续签到 / 完成阶段不再受容量约束，仅校验报名状态。
 */
public interface IHrTrainingEnrollmentService {

    Long enroll(Long sessionId, String enrollType, String comment);

    void checkIn(Long enrollmentId);

    void complete(Long enrollmentId, String completionStatus, java.math.BigDecimal score, String comment);

    void cancel(Long enrollmentId);
}
