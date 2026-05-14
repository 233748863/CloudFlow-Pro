package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrCompStructurePayload;

@TableName(value = "hr_comp_structure", autoResultMap = true)
public class HrCompStructure extends HrCompStructurePayload {
}
