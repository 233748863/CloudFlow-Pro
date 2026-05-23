package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;

@TableName(value = "hr_resume_parsed_fields", autoResultMap = true)
public class HrResumeParsedFields extends HrResumeParsedFieldsPayload {
}
