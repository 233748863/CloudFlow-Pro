package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_work_injury")
public class HrWorkInjuryPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String injuryNo;
    private Long employeeId;
    private LocalDateTime occurredAt;
    private String location;
    private String eventDescription;
    private String injuryPart;
    private String injuryLevel;
    private String status;
    private String processInstanceId;
    private LocalDateTime determinedAt;
    private Integer determinedGrade;
    @TableField("close_reason")
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
