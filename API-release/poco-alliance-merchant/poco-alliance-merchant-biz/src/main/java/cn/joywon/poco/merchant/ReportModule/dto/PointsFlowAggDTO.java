package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 积分流水聚合结果DTO
 * 用于从积分流水表聚合积分变动数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class PointsFlowAggDTO {
    
    /** 商家ID */
    private Long merchantId;
    
    /** 来源类型 */
    private String sourceType;
    
    /** 获得积分 */
    private Long earnedPoints;
    
    /** 消耗积分 */
    private Long consumedPoints;
    
    /** 过期积分 */
    private Long expiredPoints;
}
