package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrLifecycleDetailPayload;

@TableName(value = "hr_lifecycle_detail", autoResultMap = true)
public class HrLifecycleDetail extends HrLifecycleDetailPayload {
}
