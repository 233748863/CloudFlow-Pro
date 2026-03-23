package com.cloudflow.hr.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 假期类型VO
 */
@Data
public class LeaveTypeVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 假期编码
     */
    private String leaveCode;
    
    /**
     * 假期名称
     */
    private String leaveName;
    
    /**
     * 是否需要额度
     */
    private Boolean needQuota;
    
    /**
     * 是否带薪
     */
    private Boolean isPaid;
    
    /**
     * 计算单位：DAY-天 HOUR-小时
     */
    private String unit;
    
    /**
     * 额度规则（JSON格式）
     */
    private String quotaRule;
    
    /**
     * 过期规则（JSON格式）
     */
    private String expiryRule;
    
    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
    
    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
