package com.cloudflow.hr.client.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 岗位信息VO
 * 从Auth服务获取的岗位信息
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
public class PostVO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 岗位ID
     */
    private Long postId;
    
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
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}
