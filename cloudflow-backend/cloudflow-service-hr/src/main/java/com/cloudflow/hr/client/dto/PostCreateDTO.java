package com.cloudflow.hr.client.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 岗位创建DTO
 * 用于调用Auth服务创建岗位
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
public class PostCreateDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 岗位编码
     */
    private String postCode;
    
    /**
     * 岗位名称
     */
    private String postName;
    
    /**
     * 显示顺序
     */
    private Integer postSort;
    
    /**
     * 状态（0正常 1停用）
     */
    private Integer status;
    
    /**
     * 备注
     */
    private String remark;
}
