package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
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
    private Integer checkinWindowBeforeMinutes;
    private Integer checkoutWindowAfterMinutes;
    private Integer lateGraceMinutes;
    private Integer earlyExitGraceMinutes;
    private BigDecimal halfDayHoursThreshold;
    private BigDecimal absentHoursThreshold;
    private String workingHoursCalcMode;
    private String checkinDetermineMode;
    private Long holidayCalendarId;
    @JsonIgnore
    @TableField(exist = false)
    @Setter(AccessLevel.NONE)
    private boolean holidayCalendarIdSpecified;
    private Integer autoAttendanceFlag;
    private LocalDate processAttendanceAfter;
    private Integer markOnHolidayFlag;
    private Integer overtimeThresholdMinutes;
    private String color;
    private Integer status;
    private LocalDateTime createTime;
    @Version
    private Integer version;
    private LocalDateTime updateTime;

    @JsonSetter("holidayCalendarId")
    public void setHolidayCalendarId(Long holidayCalendarId) {
        this.holidayCalendarId = holidayCalendarId;
        this.holidayCalendarIdSpecified = true;
    }
}
