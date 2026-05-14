package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_interview", autoResultMap = true)
public class HrInterviewPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long candidateId;
    private String interviewRound;
    private String interviewType;
    private LocalDateTime interviewTime;
    private LocalDateTime interviewEndTime;
    private String location;
    private String evaluation;
    private BigDecimal score;
    private String result;
    private String status;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> interviewerIds;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> interviewerNames;
}
