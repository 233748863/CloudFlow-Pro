package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("crm_campaign")
public class CrmCampaign implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long campaignId;
    private Long tenantId;
    private String campaignCode;
    private String campaignName;
    private String campaignType;
    private String status;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;
    private Long ownerId;
    private String ownerName;
    private String description;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal budget;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal actualCost;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal revenue;
    private Integer sentCount;
    private Integer deliveredCount;
    private Integer openedCount;
    private Integer clickedCount;
    private Integer bouncedCount;
    private Integer unsubscribedCount;
    private Integer leadCreatedCount;
    private Integer opportunityCreatedCount;
    private Integer wonOpportunityCount;
    private BigDecimal openRate;
    private BigDecimal clickRate;
    private BigDecimal bounceRate;
    private BigDecimal unsubscribeRate;
    @TableField(updateStrategy = com.baomidou.mybatisplus.annotation.FieldStrategy.ALWAYS)
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal roi;
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
