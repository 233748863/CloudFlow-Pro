package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_performance_assignment")
public class HrPerformanceAssignmentPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long objectiveId;
    private Long parentId;
    private String assigneeType;
    private Long assigneeId;
    private String assigneeName;
    private BigDecimal targetValue;
    private BigDecimal actualValue;
    private BigDecimal weight;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
