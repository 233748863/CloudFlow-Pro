package cn.joywon.poco.merchant.ReportModule.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 联合营销效果聚合结果DTO
 * 用于从联合营销记录表聚合效果数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
public class JointMarketingAggDTO {
    
    /** 活动计划ID */
    private Long planId;
    
    /** 商家ID */
    private Long merchantId;
    
    /** 角色类型（INITIATOR-发起方, PARTICIPANT-参与方） */
    private String roleType;
    
    /** 触发次数 */
    private Integer triggerCount;
    
    /** 发券数量 */
    private Integer couponIssued;
    
    /** 分润金额 */
    private BigDecimal shareAmount;
}
