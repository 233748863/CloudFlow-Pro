package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("oa_project_milestone")
public class OaProjectMilestone implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long milestoneId;
    private Long tenantId;
    private Long projectId;
    private String milestoneName;
    private String milestoneCode;
    private Long ownerId;
    private String ownerName;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate plannedDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate baselineDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate actualDate;
    private BigDecimal progress;
    private Integer sortOrder;
    private String status;
    private String remark;
    private String delFlag;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
