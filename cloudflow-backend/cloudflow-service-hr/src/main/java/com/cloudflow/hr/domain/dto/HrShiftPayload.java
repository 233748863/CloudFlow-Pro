package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("hr_shift")
public class HrShiftPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String shiftCode;
    private String shiftName;
    private LocalTime startTime;
    private LocalTime endTime;
    private Integer breakMinutes;
    private Integer workMinutes;
    private String color;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
