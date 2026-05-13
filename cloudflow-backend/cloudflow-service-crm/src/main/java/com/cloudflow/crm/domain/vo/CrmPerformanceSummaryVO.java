package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

/**
 * CRM 业绩聚合指标，供 HR 侧绩效看板消费。
 */
@Data
public class CrmPerformanceSummaryVO {

    /** 聚合粒度：OWNER / DEPT。 */
    private String dimension;

    /** 聚合维度 ID（owner 员工 ID 或部门 ID）。 */
    private Long targetId;

    /** 维度显示名。 */
    private String targetName;

    /** 赢单数（商机 stage=WON）。 */
    private long wonOpportunityCount;

    /** 赢单预期金额合计。 */
    private BigDecimal wonAmount;

    /** 合同金额合计（商机对应已赢单报价金额）。 */
    private BigDecimal contractAmount;

    /** 已到账回款金额合计（outstanding 已清零）。 */
    private BigDecimal receivedAmount;

    /** 未到账回款金额合计（outstanding > 0）。 */
    private BigDecimal outstandingAmount;

    /** 跟进记录数。 */
    private long followUpCount;

    /** 客户数。 */
    private long customerCount;
}
