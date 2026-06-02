package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_schedule_assignment")
public class HrScheduleAssignmentPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String targetType;
    private Long targetId;
    private String targetName;
    private Long ruleId;
    private Long shiftId;
    private LocalDate scheduleDate;
    private LocalDate effectiveStart;
    private LocalDate effectiveEnd;
    private String status;
    private LocalDateTime createTime;
    @Version
    private Integer version;
    private LocalDateTime updateTime;
}
