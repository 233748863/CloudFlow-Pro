package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrSalarySlipPayload;
import lombok.Getter;
import lombok.Setter;

@TableName(value = "hr_salary_slip", autoResultMap = true)
public class HrSalarySlip extends HrSalarySlipPayload {
    @Getter
    @Setter
    private Long reservedSettlementId;
}
