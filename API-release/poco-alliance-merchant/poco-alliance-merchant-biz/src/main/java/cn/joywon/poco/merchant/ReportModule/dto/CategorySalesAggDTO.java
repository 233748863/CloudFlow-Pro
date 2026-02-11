package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 分类销售汇总聚合结果DTO
 * 用于按商品分类聚合销售数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class CategorySalesAggDTO {
    
    /** 分类ID */
    private Long categoryId;
    
    /** 分类名称 */
    private String categoryName;
    
    /** 门店ID */
    private Long storeId;
    
    /** 商家ID */
    private Long merchantId;
    
    /** 销售数量 */
    private Integer salesQuantity;
    
    /** 销售金额 */
    private BigDecimal salesAmount;
}
