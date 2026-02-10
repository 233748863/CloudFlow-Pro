package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 发布回滚历史实体
 */
@Data
@TableName("wf_deploy_rollback_history")
public class WfDeployRollbackHistory {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 原发布记录ID */
    private Long originalDeployId;

    /** 回滚后的发布记录ID */
    private Long rollbackDeployId;

    /** 从哪个版本回滚 */
    private Integer fromVersion;

    /** 回滚到哪个版本 */
    private Integer toVersion;

    /** 回滚原因 */
    private String rollbackReason;

    /** 回滚类型: MANUAL-手动, AUTO-自动 */
    private String rollbackType;

    /** 回滚状态: SUCCESS-成功, FAILED-失败, PARTIAL-部分成功 */
    private String rollbackStatus;

    /** 错误信息 */
    private String errorMessage;

    /** 回滚操作人ID */
    private Long rollbackBy;

    /** 回滚时间 */
    private LocalDateTime rollbackTime;
}
