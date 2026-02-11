package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;

/**
 * 用户消费分析聚合结果DTO
 * 用于从订单表聚合用户消费行为数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class UserConsumptionAggDTO {
    
    /** 商家ID */
    private Long merchantId;
    
    /** 门店ID */
    private Long storeId;
    
    /** 新用户数（首次下单） */
    private Integer newUserCount;
    
    /** 活跃用户数 */
    private Integer activeUserCount;
    
    /** 消费金额0-50元用户数 */
    private Integer amount0To50;
    
    /** 消费金额50-100元用户数 */
    private Integer amount50To100;
    
    /** 消费金额100-200元用户数 */
    private Integer amount100To200;
    
    /** 消费金额200元以上用户数 */
    private Integer amount200Plus;
}
