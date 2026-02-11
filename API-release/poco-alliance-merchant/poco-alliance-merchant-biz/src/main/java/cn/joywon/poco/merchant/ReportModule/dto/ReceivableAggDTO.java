package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 应收账款聚合结果DTO
 * 用于计算待结算金额和账龄分布
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class ReceivableAggDTO {
    
    /** 商家ID */
    private Long merchantId;
    
    /** 门店ID */
    private Long storeId;
    
    /** 待结算总金额 */
    private BigDecimal totalReceivable;
    
    /** 待结算订单数 */
    private Integer orderCount;
    
    /** 账龄0-7天金额 */
    private BigDecimal aging0To7;
    
    /** 账龄8-15天金额 */
    private BigDecimal aging8To15;
    
    /** 账龄16-30天金额 */
    private BigDecimal aging16To30;
    
    /** 账龄30天以上金额 */
    private BigDecimal aging30Plus;
}
