package com.cloudflow.common.workflow.callback.registry;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

/**
 * 业务类型注册项。
 *
 * 一个 BusinessTypeDef 描述一个跨模块流程对接的业务实体：流程实例对应的业务表、状态字段、对账要查询的列名。
 * 由各业务模块在自身 {@code BusinessTypeContributor} 中注册到 {@link BusinessTypeRegistry}。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BusinessTypeDef {

    /** 业务类型代码，用于流程对账与前端展示，作为唯一主键（如 HR_RECRUITMENT / OA_EXPENSE_CLAIM）。 */
    private String code;

    /** 所属模块：hr / oa / crm（小写）。 */
    private String module;

    /** 业务表表名（如 hr_recruitment_requisition）。对账作业反查不一致记录使用。 */
    private String businessTable;

    /** 业务表的"状态"列名。默认 status。 */
    @Builder.Default
    private String statusField = "status";

    /** 业务表的"流程实例 ID"列名。默认 process_instance_id。 */
    @Builder.Default
    private String processInstanceIdField = "process_instance_id";

    /** 业务表的主键列名。默认 id。 */
    @Builder.Default
    private String idField = "id";

    /** 本审批阶段仍等待流程结果的业务状态；使用绑定参数参与对账查询。 */
    @Builder.Default
    private List<String> pendingStatuses = List.of("PENDING_APPROVAL", "PENDING", "APPROVING", "IN_APPROVAL", "SUBMITTED");

    /** 本审批阶段已经结束的业务状态，包含审批通过后的后续办理状态。 */
    @Builder.Default
    private List<String> finishedStatuses = List.of("APPROVED", "REJECTED", "COMPLETED", "CANCELLED");

    /** 用于前端展示的可读名称（如"招聘需求审批"）。 */
    private String displayName;
}
