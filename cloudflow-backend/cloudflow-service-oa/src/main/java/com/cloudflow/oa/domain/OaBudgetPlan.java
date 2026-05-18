package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName("oa_budget_plan")
public class OaBudgetPlan implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long budgetId;
    private Long tenantId;
    private String instanceId;
    private String budgetNo;
    private String budgetName;
    private Integer fiscalYear;
    private String periodType;
    private String targetType;
    private Long targetId;
    private String targetName;
    private Long deptId;
    private String deptName;
    private Long projectId;
    private String projectName;
    private Long ownerId;
    private String ownerName;
    private BigDecimal totalAmount;
    private BigDecimal reservedAmount;
    private BigDecimal actualAmount;
    private BigDecimal availableAmount;
    private Integer versionNo;
    private String status;
    private String remark;
    private Integer deleted;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableField(exist = false)
    private List<OaBudgetLine> lines;

    @TableField(exist = false)
    private String thresholdStatus;
}
