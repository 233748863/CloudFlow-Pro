package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("crm_deal_allocation")
public class CrmDealAllocation implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long allocationId;
    private Long tenantId;
    private Long eventId;
    private Long salesUserId;
    private Long employeeId;
    private Long deptId;
    private String roleType;
    private BigDecimal allocatedPercentage;
    private BigDecimal allocatedAmount;
    private BigDecimal commissionRate;
    private BigDecimal commissionAmount;
    private String commissionStatus;
    private Long compChangeId;
    private Long reversalOfId;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
