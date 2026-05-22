package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrBenefitPaymentPayload;

@TableName(value = "hr_benefit_payment", autoResultMap = true)
public class HrBenefitPayment extends HrBenefitPaymentPayload {
}
