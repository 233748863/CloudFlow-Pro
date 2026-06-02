package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_training_course", autoResultMap = true)
public class HrTrainingCoursePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String courseCode;
    private String courseName;
    private Long categoryId;
    private Long instructorId;
    private String mode;
    private BigDecimal durationHours;
    private BigDecimal creditHours;
    private String coverUrl;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> materials;

    private String description;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
