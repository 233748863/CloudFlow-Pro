package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrBenefitRequestPayload;

@TableName(value = "hr_benefit_request", autoResultMap = true)
public class HrBenefitRequest extends HrBenefitRequestPayload {
}
