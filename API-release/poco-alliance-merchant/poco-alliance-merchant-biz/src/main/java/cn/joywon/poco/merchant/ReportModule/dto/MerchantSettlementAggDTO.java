package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 商家结算日报聚合结果DTO
 * 用于从订单和支付表聚合商家每日结算数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class MerchantSettlementAggDTO {
    
    /** 商家ID */
    private Long merchantId;
    
    /** 总营业额 */
    private BigDecimal totalRevenue;
    
    /** 订单数 */
    private Integer orderCount;
    
    /** 支付渠道 */
    private String channel;
    
    /** 渠道收入金额 */
    private BigDecimal channelAmount;
}
