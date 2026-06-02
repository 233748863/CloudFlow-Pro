package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_time_request")
public class HrTimeRequestPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String requestNo;
    private String requestType;
    private Long employeeId;
    private Long leaveTypeId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private BigDecimal duration;
    private String unit;
    private String reason;
    private String status;
    private String processInstanceId;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
