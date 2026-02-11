package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 时段销售趋势聚合结果DTO
 * 用于按小时聚合销售数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class HourlySalesAggDTO {
    
    /** 商家ID */
    private Long merchantId;
    
    /** 门店ID */
    private Long storeId;
    
    /** 小时（0-23） */
    private Integer hourOfDay;
    
    /** 订单数 */
    private Integer orderCount;
    
    /** 销售金额 */
    private BigDecimal salesAmount;
    
    /** 平均客单价 */
    private BigDecimal avgOrderValue;
}
