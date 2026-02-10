package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

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
    
    private Long tenantId;
    
    private String createBy;
    
    private Date createTime;
}
