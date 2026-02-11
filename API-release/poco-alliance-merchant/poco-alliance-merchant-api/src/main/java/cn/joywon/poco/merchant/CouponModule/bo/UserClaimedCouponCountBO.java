package cn.joywon.poco.merchant.CouponModule.bo;

import lombok.Data;

@Data
public class UserClaimedCouponCountBO {

    private Long couponTemplateId;

    private Integer claimedCount;

}