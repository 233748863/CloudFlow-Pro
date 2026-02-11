package cn.joywon.poco.merchant.MerchantModule.bo;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class MiniMerchantIndexBO {

    private Double distance;

    private Long storeId;

    private String storeName;

    private String storeLogo;

    private String storeImages;

    private String storePhone;

    private String storeAddress;

    private BusinessStatusEnum businessStatus;

    private String businessHours;

    private BigDecimal latitude;

    private BigDecimal longitude;

    private Double storeDistance;

    private BigDecimal storeScore;

    private String description;

    private Long merchantId;

    private String merchantName;

    private String merchantLogo;

    private String merchantImages;

    private Long industryId;

    private String industryName;

    private Integer couponCount;

}