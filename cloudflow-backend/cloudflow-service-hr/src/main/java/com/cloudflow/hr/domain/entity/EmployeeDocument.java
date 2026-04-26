package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工证件实体类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
@TableName("hr_employee_document")
public class EmployeeDocument implements Serializable {

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
     * 员工ID
     */
    private Long employeeId;

    /**
     * 证件类型：ID_CARD-身份证 PASSPORT-护照 DIPLOMA-学历证书 DEGREE-学位证书
     */
    private String documentType;

    /**
     * 证件号码
     */
    private String documentNo;

    /**
     * 签发日期
     */
    private LocalDate issueDate;

    /**
     * 有效期至
     */
    private LocalDate expiryDate;

    /**
     * 证件扫描件URL
     */

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
     * 创建人
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /**
     * 更新人
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}
