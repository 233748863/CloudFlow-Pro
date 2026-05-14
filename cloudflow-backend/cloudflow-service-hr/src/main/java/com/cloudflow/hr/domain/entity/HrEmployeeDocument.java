package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrEmployeeDocumentPayload;

@TableName(value = "hr_employee_document", autoResultMap = true)
public class HrEmployeeDocument extends HrEmployeeDocumentPayload {
}
