package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

/**
 * 紧急联系人创建DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmergencyContactCreateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    /**
     * 联系人姓名
     */
    @NotBlank(message = "联系人姓名不能为空")
    private String contactName;

    /**
     * 关系：SPOUSE-配偶 PARENT-父母 SIBLING-兄弟姐妹 CHILD-子女 OTHER-其他
     */
    @NotBlank(message = "关系不能为空")
    private String relationship;

    /**
     * 联系电话
     */
    @NotBlank(message = "联系电话不能为空")
    private String phone;

    /**
     * 联系地址
     */
    private String address;

    /**
     * 优先级：1-第一联系人 2-第二联系人
     */
    private Integer priority;
}
