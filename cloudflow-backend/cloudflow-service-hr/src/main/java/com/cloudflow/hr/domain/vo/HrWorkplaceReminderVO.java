package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;

/**
 * HR 工作台提醒项。
 *
 * <p>由 {@code HrInnerWorkplaceController#listReminders} 返回，供 OA 工作台聚合展示。
 */
@Data
public class HrWorkplaceReminderVO {

    /** 唯一标识：{type}-{businessId}。 */
    private String id;

    /** 提醒类型：CONTRACT_EXPIRING / LIFECYCLE_TASK。 */
    private String type;

    /** 数据来源标签（前端展示）。 */
    private String sourceLabel;

    /** 标题。 */
    private String title;

    /** 描述（如：某员工合同将在 X 天后到期）。 */
    private String description;

    /** 截止日期（合同到期日 / 生命周期任务 dueDate）。 */
    private LocalDate dueDate;

    /** 严重程度：LOW / MEDIUM / HIGH。 */
    private String severity;

    /** 业务主键 ID（hr_employee_contract.id 或 hr_lifecycle_task.id）。 */
    private Long businessId;

    /** 业务类型常量。 */
    private String businessType;

    /** 前端跳转路径（OA 工作台可直接 navigate）。 */
    private String path;
}
