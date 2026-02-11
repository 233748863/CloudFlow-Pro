package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 门店经营日报聚合结果DTO
 * 用于从订单表聚合门店每日经营数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class StoreDailyStatsAggDTO {
    
    /** 门店ID */
    private Long storeId;
    
    /** 商家ID */
    private Long merchantId;
    
    /** 门店名称 */
    private String storeName;
    
    /** 总订单数 */
    private Integer totalOrderCount;
    
    /** 已支付订单数 */
    private Integer paidOrderCount;
    
    /** 总销售额（GMV） */
    private BigDecimal totalSalesAmount;
    
    /** 实付金额 */
    private BigDecimal realPayAmount;
    
    /** 退款订单数 */
    private Integer refundOrderCount;
    
    /** 退款金额 */
    private BigDecimal refundAmount;
}
