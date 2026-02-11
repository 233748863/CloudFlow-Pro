package cn.joywon.poco.merchant.MerchantModule.bo;

import lombok.Data;

@Data
public class QualificationBO {

    // 门店/商家ID
    private Long id;

    // 营业执照编号
    private String licenseNo;

    // 资质图片
    private String licenseImage;

    // 法人姓名
    private String legalPerson;

}