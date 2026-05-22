package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_mall_order_item")
public class HrMallOrderItemPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long orderId;
    private Long itemId;
    private String itemName;
    private Integer pointPrice;
    private Integer quantity;
    private Integer subtotal;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
