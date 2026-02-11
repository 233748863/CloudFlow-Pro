package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 代理佣金聚合结果DTO
 * 用于从代理佣金流水表聚合佣金数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class AgentCommissionAggDTO {
    
    /** 代理ID */
    private Long agentId;
    
    /** 代理名称 */
    private String agentName;
    
    /** 区域编码 */
    private String regionCode;
    
    /** 佣金总额 */
    private BigDecimal totalCommission;
    
    /** 已结算金额 */
    private BigDecimal settledAmount;
    
    /** 待结算金额 */
    private BigDecimal pendingAmount;
    
    /** 订单数 */
    private Integer orderCount;
    
    /** 商家数 */
    private Integer merchantCount;
    
    /** 已提现金额 */
    private BigDecimal withdrawnAmount;
}
