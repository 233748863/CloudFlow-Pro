package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrCandidatePayload;

@TableName(value = "hr_candidate", autoResultMap = true)
public class HrCandidate extends HrCandidatePayload {
}
