package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrEmployeeContractPayload;

@TableName(value = "hr_employee_contract", autoResultMap = true)
public class HrEmployeeContract extends HrEmployeeContractPayload {
}
