package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 紧急联系人更新DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmergencyContactUpdateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 联系人姓名
     */
    private String contactName;

    /**
     * 关系：SPOUSE-配偶 PARENT-父母 SIBLING-兄弟姐妹 CHILD-子女 OTHER-其他
     */
    private String relationship;

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
}
