package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 退款分析聚合结果DTO
 * 用于从退款表聚合退款统计数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class RefundAnalysisAggDTO {
    
    /** 门店ID */
    private Long storeId;
    
    /** 商家ID */
    private Long merchantId;
    
    /** 退款类型 */
    private String refundType;
    
    /** 退款订单数 */
    private Integer refundCount;
    
    /** 退款金额 */
    private BigDecimal refundAmount;
    
    /** 平均处理时长（小时） */
    private BigDecimal avgProcessHours;
}
