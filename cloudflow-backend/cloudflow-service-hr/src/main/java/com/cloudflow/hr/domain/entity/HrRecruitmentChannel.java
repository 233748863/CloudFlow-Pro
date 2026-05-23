package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrRecruitmentChannelPayload;

@TableName(value = "hr_recruitment_channel", autoResultMap = true)
public class HrRecruitmentChannel extends HrRecruitmentChannelPayload {
}
