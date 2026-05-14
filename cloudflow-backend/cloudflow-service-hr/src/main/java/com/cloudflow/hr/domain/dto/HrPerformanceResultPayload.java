package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_performance_result")
public class HrPerformanceResultPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long objectiveId;
    private Long assignmentId;
    private Long employeeId;
    private BigDecimal score;
    private String grade;
    private String summary;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
