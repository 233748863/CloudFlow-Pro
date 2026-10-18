package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
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
@TableName("crm_deal_team")
public class CrmDealTeam implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long teamId;
    private Long tenantId;
    private String bizType;
    private Long bizId;
    private Integer teamVersion;
    private Integer currentFlag;
    private Long salesUserId;
    private String salesUserName;
    private Long deptId;
    private String roleType;
    private BigDecimal allocatedPercentage;
    private BigDecimal allocatedAmount;
    private BigDecimal commissionRate;
    private BigDecimal commissionAmount;
    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Long currentMemberId;
    private String remark;
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
