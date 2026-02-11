package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 支付渠道对账聚合结果DTO
 * 用于按支付渠道聚合交易数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class PayChannelReconcileAggDTO {
    
    /** 支付渠道 */
    private String channel;
    
    /** 商家ID */
    private Long merchantId;
    
    /** 门店ID */
    private Long storeId;
    
    /** 交易笔数 */
    private Integer transactionCount;
    
    /** 交易金额 */
    private BigDecimal transactionAmount;
    
    /** 退款笔数 */
    private Integer refundCount;
    
    /** 退款金额 */
    private BigDecimal refundAmount;
}
