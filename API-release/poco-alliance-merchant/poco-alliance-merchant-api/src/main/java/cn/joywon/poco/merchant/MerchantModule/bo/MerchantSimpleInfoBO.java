package cn.joywon.poco.merchant.MerchantModule.bo;

import lombok.Data;

@Data
// 商家简要信息业务数据
public class MerchantSimpleInfoBO {

    // 商家ID
    private Long merchantId;

    // 商家名称
    private String merchantName;

    // 商家logo
    private String merchantLogo;

    // 行业ID
    private Long industryId;

    // 行业名称
    private String industryName;

}