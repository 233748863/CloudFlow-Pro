package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrTrainingSessionPayload;

/**
 * 培训管理业务服务（CRUD 外的业务规则下沉点）：
 * <ul>
 *   <li>班次创建时校验 capacity > 0、startTime &lt; endTime，状态默认 PLANNED</li>
 *   <li>班次状态变更走状态机：PLANNED → REGISTERING → ONGOING → COMPLETED；任意状态可 CANCELLED</li>
 *   <li>容量校验由 {@link com.cloudflow.hr.service.HrTrainingEnrollmentService#enroll} 调用，
 *       此处仅暴露班次维度的开/关班次入口</li>
 * </ul>
 */
public interface HrTrainingService {

    /**
     * 新建培训班次：默认 status=PLANNED，enrolledCount=0。
     */
    Long createSession(HrTrainingSessionPayload payload);

    /**
     * 班次状态切换。{@code action} 在 register / start / complete / cancel 之间；
     * 返回切换后的 status。
     */
    String changeSessionStatus(Long sessionId, String action);
}
