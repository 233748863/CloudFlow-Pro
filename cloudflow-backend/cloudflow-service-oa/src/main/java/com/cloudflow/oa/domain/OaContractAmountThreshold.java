package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * OA-P0-3 合同金额审批阈值。
 */
@Data
@TableName("oa_contract_amount_threshold")
public class OaContractAmountThreshold implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    /** 业务单元(可空表示全租户通用) */
    private String businessUnit;
    /** 金额下限(含) */
    private BigDecimal thresholdMin;
    /** 金额上限(不含, null=∞) */
    private BigDecimal thresholdMax;
    /** 金额档位 T1/T2/T3 */
    private String amountTier;
    /** 所需审批角色 DEPT_MGR/VP/CEO */
    private String approverRole;
    /** 状态 ACTIVE/INACTIVE */
    private String status;
    private String remark;
    private Integer deleted;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
