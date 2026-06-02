package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_talent_calibration_session", autoResultMap = true)
public class HrTalentCalibrationSessionPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long reviewId;
    private String sessionNo;
    private String sessionName;
    private LocalDateTime scheduledAt;
    private String location;
    private Long facilitatorId;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> participants;

    private String agenda;
    private String minutes;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
