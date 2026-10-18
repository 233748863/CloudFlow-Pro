package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrOfferPayload;

@TableName(value = "hr_offer", autoResultMap = true)
public class HrOffer extends HrOfferPayload {
}
