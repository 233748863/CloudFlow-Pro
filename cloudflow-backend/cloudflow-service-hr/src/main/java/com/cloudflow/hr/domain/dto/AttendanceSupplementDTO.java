package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 补卡申请 DTO
 *
 * 说明：
 * 前端补卡会以 yyyy-MM-dd HH:mm:ss 形式提交补卡时间，
 * 这里显式声明格式，保证真实联调时能被正常反序列化。
 */
@Data
public class AttendanceSupplementDTO {

    /**
     * 员工 ID，可不传；不传时由当前登录用户推导
     */
    private Long employeeId;

    /**
     * 考勤日期
     */
    @NotNull(message = "考勤日期不能为空")
    private LocalDate attendanceDate;

    /**
     * 打卡类型：CHECK_IN/CHECK_OUT
     */
    @NotBlank(message = "打卡类型不能为空")
    private String checkType;

    /**
     * 补卡时间
     */
    @NotNull(message = "补卡时间不能为空")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime checkTime;

    /**
     * 补卡原因
     */
    @NotBlank(message = "补卡原因不能为空")
    private String reason;
}
