package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrBenefitSchemePayload;

@TableName(value = "hr_benefit_scheme", autoResultMap = true)
public class HrBenefitScheme extends HrBenefitSchemePayload {
}
