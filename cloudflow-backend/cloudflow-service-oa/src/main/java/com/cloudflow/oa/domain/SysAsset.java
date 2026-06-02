package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 固定资产
 */
@Data
@TableName("oa_asset")
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
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    
    private LocalDateTime purchaseDate;
    
    private Long ownerId;
    
    private String location;
    
    private String remark;
    
    private Long tenantId;
    
    private String createBy;
    
    
    @Version
    
    private Integer version;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    
    private LocalDateTime createTime;
}
