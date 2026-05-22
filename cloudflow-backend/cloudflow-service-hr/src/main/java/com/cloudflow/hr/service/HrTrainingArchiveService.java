package com.cloudflow.hr.service;

import java.util.Map;

/**
 * 培训档案服务：按员工聚合培训学时 / 课程列表 / 证书列表。
 *
 * <p>不建物理 hr_training_archive 表，由 service 在请求时实时聚合
 * {@code hr_training_enrollment + hr_training_certificate + hr_training_course}，
 * 用 {@code idx_hr_training_enrollment_completion(tenant_id, employee_id, completion_status)} 缓解。
 *
 * <p>跨年统计性能不足时，可在 P2 阶段加物化表；本批次先保证一致性。
 */
public interface HrTrainingArchiveService {

    /**
     * 当前登录员工档案。
     */
    Map<String, Object> mine();

    /**
     * 指定员工档案（HR 管理员视角）。
     */
    Map<String, Object> forEmployee(Long employeeId);
}
