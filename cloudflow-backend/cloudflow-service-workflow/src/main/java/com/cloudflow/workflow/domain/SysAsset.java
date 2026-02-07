package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.util.Date;

/**
 * 固定资产
 */
@Data
@TableName("sys_asset")
public class SysAsset {
    
    @TableId(type = IdType.AUTO)
    private Long assetId;
    
    private String assetCode;
    
    private String name;
    
    private String category;
    
    private String model;
    
    /** 1闲置 2在用 3维修 4报废 5丢失 */
    private String status;
    
    private BigDecimal price;
    
    private Date purchaseDate;
    
    private Long ownerId;
    
    private String location;
    
    private String remark;
    
    private Long tenantId;
    
    private String createBy;
    
    private Date createTime;
}
