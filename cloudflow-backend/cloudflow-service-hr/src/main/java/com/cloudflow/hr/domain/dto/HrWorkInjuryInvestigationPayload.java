package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_work_injury_investigation", autoResultMap = true)
public class HrWorkInjuryInvestigationPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long injuryId;
    private Long investigatorId;
    private LocalDate investigationDate;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> scenePhotos;

    private String witnessStatements;
    private String conclusion;
    private String responsibilityType;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
