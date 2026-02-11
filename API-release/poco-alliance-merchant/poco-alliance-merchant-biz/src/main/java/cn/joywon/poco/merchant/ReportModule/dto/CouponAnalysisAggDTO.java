package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 优惠券分析聚合结果DTO
 * 用于从优惠券表聚合使用分析数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class CouponAnalysisAggDTO {
    
    /** 商家ID */
    private Long merchantId;
    
    /** 优惠券类型 */
    private String couponType;
    
    /** 优惠券来源（PLATFORM-平台券, SELF-商家券） */
    private String couponSource;
    
    /** 发放数量 */
    private Integer issuedCount;
    
    /** 核销数量 */
    private Integer usedCount;
    
    /** 优惠金额 */
    private BigDecimal discountAmount;
}
