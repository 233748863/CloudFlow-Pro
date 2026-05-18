package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("crm_assignment_rule")
public class CrmAssignmentRule implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long ruleId;
    private Long tenantId;
    private String ruleName;
    private String ruleType;
    private Integer priority;
    private String status;
    private Integer inactiveDays;
    private Integer maxPerOwner;
    private Long deptId;
    private String deptName;
    private String customerLevel;
    private String customerTags;
    private LocalDate effectiveStart;
    private LocalDate effectiveEnd;
    private String remark;
    private Integer deleted;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
