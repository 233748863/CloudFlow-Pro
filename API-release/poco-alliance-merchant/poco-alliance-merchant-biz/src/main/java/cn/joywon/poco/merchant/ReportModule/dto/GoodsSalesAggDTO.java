package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 商品销售日报聚合结果DTO
 * 用于从订单明细表聚合SKU维度的销售数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class GoodsSalesAggDTO {
    
    /** 商品SKU ID */
    private Long productSkuId;
    
    /** 商品ID */
    private Long productId;
    
    /** 商品名称 */
    private String productName;
    
    /** SKU名称/规格 */
    private String skuName;
    
    /** 门店ID */
    private Long storeId;
    
    /** 商家ID */
    private Long merchantId;
    
    /** 销售数量 */
    private Integer salesQuantity;
    
    /** 销售金额 */
    private BigDecimal salesAmount;
}
