package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 平台运营概览聚合结果DTO
 * 用于汇总平台级运营数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class PlatformOverviewAggDTO {
    
    /** 总GMV */
    private BigDecimal totalGmv;
    
    /** 总订单数 */
    private Integer totalOrders;
    
    /** 活跃商家数 */
    private Integer activeMerchants;
    
    /** 活跃用户数 */
    private Integer activeUsers;
    
    /** 平台佣金收入 */
    private BigDecimal commissionIncome;
}
