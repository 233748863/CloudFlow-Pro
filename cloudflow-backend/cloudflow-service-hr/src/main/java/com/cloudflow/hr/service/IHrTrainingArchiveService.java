package com.cloudflow.hr.service;

import java.util.Map;

/**
 * HR-P0-1 培训档案服务: 物理化聚合 hr_training_archive。
 *
 * <p>读路径优先查 hr_training_archive 物理表, 未命中(新员工/库存量为 0)回退到旧实时聚合并写回。
 * 写路径由 hr_training_enrollment / hr_training_certificate 状态变更 hook 异步触发单员工重算,
 * 凌晨 02:30 由 {@code TrainingArchiveRebuildJob} 全量重建兜底。
 */
public interface IHrTrainingArchiveService {

    /**
     * 当前登录员工档案。
     */
    Map<String, Object> mine();

    /**
     * 指定员工档案(HR 管理员视角)。
     */
    Map<String, Object> forEmployee(Long employeeId);

    /**
     * HR-P0-1 报名状态变更触发增量重算: PENDING → APPROVED / COMPLETED / REJECTED 等。
     */
    void incrementOnEnrollmentChange(Long employeeId);

    /**
     * HR-P0-1 证书颁发 / 撤销触发增量重算。
     */
    void incrementOnCertificateChange(Long employeeId);

    /**
     * HR-P0-1 单员工全量重算并写入 hr_training_archive(同步)。
     */
    void rebuildOne(Long employeeId);

    /**
     * HR-P0-1 全量重建所有员工档案 - 由凌晨定时任务调用兜底数据漂移。
     */
    int rebuildAll();
}
