package cn.joywon.poco.merchant.MerchantModule.bo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class StoreCacheBO {

    private String id;

    private String name;

    private String phone;

    private String description;

    private String merchantId;

    private String merchantName;

    private String merchantLogo;

    private String industryId;

    private String industryName;

    private String addressDetail;

    private String logoUrl;

    private String businessHours;

    private String businessStatus;

    private BigDecimal storeScore;

    private Double latitude;

    private Double longitude;

    private Double distance;

}