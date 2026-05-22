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
import java.util.Map;

@Data
@TableName(value = "hr_exam_attempt", autoResultMap = true)
public class HrExamAttemptPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long paperId;
    private Long employeeId;
    private Long sessionId;
    private LocalDateTime startTime;
    private LocalDateTime submitTime;
    private BigDecimal score;
    private Boolean passFlag;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> answers;

    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
