package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrDisputeArbitrationPayload;

@TableName(value = "hr_dispute_arbitration", autoResultMap = true)
public class HrDisputeArbitration extends HrDisputeArbitrationPayload {
}
