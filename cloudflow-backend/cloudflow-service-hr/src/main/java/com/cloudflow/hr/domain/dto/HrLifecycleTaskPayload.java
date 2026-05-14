package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_lifecycle_task")
public class HrLifecycleTaskPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long applicationId;
    private String taskName;
    private String taskType;
    private Long ownerId;
    private LocalDate dueDate;
    private String status;
    private String remark;
    private LocalDateTime completedTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
