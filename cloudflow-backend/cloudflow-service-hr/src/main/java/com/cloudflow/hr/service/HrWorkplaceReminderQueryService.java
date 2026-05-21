package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.vo.HrWorkplaceReminderVO;

import java.util.List;

/**
 * 工作台提醒聚合查询。
 *
 * <p>供 OA 工作台通过 {@code HrInnerWorkplaceController} 跨服务调用，
 * 聚合 HR 域内合同到期、生命周期任务等待办类信号。
 */
public interface HrWorkplaceReminderQueryService {

    /**
     * 查询某用户的工作台 HR 提醒列表。
     *
     * @param userId       当前登录用户 ID（关联到 hr_lifecycle_task.owner_id）
     * @param expiringDays 合同到期窗口天数（默认 30）
     * @param limit        最多返回条数
     */
    List<HrWorkplaceReminderVO> listReminders(Long userId, int expiringDays, int limit);
}
