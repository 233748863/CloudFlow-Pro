package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 紧急联系人VO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmergencyContactVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
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
     * 员工姓名
     */
    private String employeeName;

    /**
     * 员工工号
     */
    private String employeeNo;

    /**
     * 联系人姓名
     */
    private String contactName;

    /**
     * 关系：SPOUSE-配偶 PARENT-父母 SIBLING-兄弟姐妹 CHILD-子女 OTHER-其他
     */
    private String relationship;

    /**
     * 关系名称
     */
    private String relationshipName;

    /**
     * 联系电话
     */
    private String phone;

    /**
     * 联系地址
     */
    private String address;

    /**
     * 优先级：1-第一联系人 2-第二联系人
     */
    private Integer priority;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
