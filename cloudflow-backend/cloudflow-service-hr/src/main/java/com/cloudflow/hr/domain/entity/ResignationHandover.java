package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 离职交接实体类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_resignation_handover")
public class ResignationHandover implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 离职申请ID
     */
    private Long applicationId;

    /**
     * 交接项目
     */
    private String handoverItem;

    /**
     * 交接类型：WORK-工作交接 ASSET-资产归还 DOCUMENT-文档交接 ACCOUNT-账号注销
     */
    private String handoverType;

    /**
     * 交接对象ID
     */
    private Long handoverToId;

    /**
     * 状态：PENDING-待交接 COMPLETED-已完成
     */
    private String status;

    /**
     * 完成时间
     */
    private LocalDateTime completedTime;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}
