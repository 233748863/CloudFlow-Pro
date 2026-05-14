package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_lifecycle_application")
public class HrLifecycleApplicationPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String applicationNo;
    private String type;
    private Long employeeId;
    private Long candidateId;
    private String name;
    private Long deptId;
    private Long postId;
    private Long positionId;
    private LocalDate effectiveDate;
    private String status;
    private String processInstanceId;
    private String remark;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(exist = false)
    private JsonNode detailJson;
}
