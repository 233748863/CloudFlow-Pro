package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrTalentCalibrationSessionPayload;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
@TableName(value = "hr_talent_calibration_session", autoResultMap = true)
public class HrTalentCalibrationSession extends HrTalentCalibrationSessionPayload {
    private Long cycleId;
}
