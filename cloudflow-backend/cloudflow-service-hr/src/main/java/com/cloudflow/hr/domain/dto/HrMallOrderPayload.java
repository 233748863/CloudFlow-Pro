package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_mall_order")
public class HrMallOrderPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String orderNo;
    private Long employeeId;
    private Integer totalPoints;
    private String receiverName;

    @EncryptField
    private String receiverPhone;

    @EncryptField
    private String receiverAddress;

    private String expressNo;
    private String status;
    private String processInstanceId;
    private LocalDateTime shippedAt;
    private LocalDateTime completedAt;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private Integer version;
}
