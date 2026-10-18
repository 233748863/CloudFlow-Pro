package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("oa_supplier_score_criteria")
public class OaSupplierScoreCriteria implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long criteriaId;

    private Long tenantId;

    private Long scorecardId;

    private String criteriaCode;

    private String criteriaName;

    private BigDecimal weight;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal score;

    private BigDecimal maxScore;

    private String dataSource;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal autoValue;

    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
