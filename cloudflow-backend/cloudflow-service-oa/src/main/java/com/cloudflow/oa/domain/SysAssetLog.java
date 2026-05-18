package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 资产变动日志实体
 */
@Data
@TableName("oa_asset_log")
public class SysAssetLog implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 日志ID
     */
    @TableId(type = IdType.AUTO)
    private Long logId;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 关联ID(资产或耗材)
     */
    private Long refId;
    
    /**
     * 关联类型(1固定资产 2耗材)
     */
    private String refType;
    
    /**
     * 操作类型(领用/归还/入库/出库/盘点)
     */
    private String type;
    
    /**
     * 数量变动
     */
    private Integer quantityChange;
    
    /**
     * 操作人ID
     */
    private Long operatorId;
    
    /**
     * 领用人/归还人ID
     */
    private Long targetId;
    
    /**
     * 备注
     */
    private String remark;
    
    /**
     * 操作时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;
}
