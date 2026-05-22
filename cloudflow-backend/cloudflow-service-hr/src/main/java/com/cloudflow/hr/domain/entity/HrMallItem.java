package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrMallItemPayload;

@TableName(value = "hr_mall_item", autoResultMap = true)
public class HrMallItem extends HrMallItemPayload {
}
