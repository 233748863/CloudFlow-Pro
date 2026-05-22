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
@TableName(value = "hr_exam_question_bank", autoResultMap = true)
public class HrExamQuestionBankPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long categoryId;
    private String questionType;
    private String content;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> options;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Object> answer;

    private BigDecimal score;
    private Integer difficulty;
    private String analysis;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}
