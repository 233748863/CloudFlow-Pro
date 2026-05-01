package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 耗材库存
 */
@Data
@TableName("sys_consumable")
public class SysConsumable {
    
    @TableId(type = IdType.AUTO)
    private Long consumableId;
    
    private String name;
    
    private String model;
    
    private String unit;
    
    private Integer quantity;
    
    private Integer lowStockThreshold;

    private Long defaultSupplierId;

    private Integer targetStock;

    private Integer warnEnabled;

    private String delFlag;
    
    private Long tenantId;
    
    private String createBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
