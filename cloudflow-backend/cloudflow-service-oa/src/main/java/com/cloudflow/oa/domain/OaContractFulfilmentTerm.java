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
@TableName("oa_contract_fulfilment_term")
public class OaContractFulfilmentTerm implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long termId;

    private Long tenantId;

    private Long contractId;

    private Integer termNo;

    private String termCategory;

    private String termContent;

    private String requirement;

    private String responsibleParty;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long responsibleId;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String responsibleName;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalDate deadlineDate;

    private Integer fulfilledFlag;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalDate fulfilledDate;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long fulfilledBy;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String fulfilledByName;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String evidenceFileUrl;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String evidenceRemark;

    private Integer overdueFlag;

    private Integer waivedFlag;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String waivedReason;

    private Integer sortNo;

    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

    @Version
    private Integer version;

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
