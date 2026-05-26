package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.OaContractMilestone;
import com.cloudflow.oa.domain.OaContractPaymentSchedule;
import com.cloudflow.oa.domain.vo.DynamicMapVO;

import java.util.List;

/**
 * OA-P1-1 合同履约里程碑 + 付款计划。
 *
 * <p>到期未完成会向 WorkplaceServiceImpl.loadRiskItems 注入合同履约风险卡片。
 */
public interface IOaContractMilestoneService {

    Page<OaContractMilestone> pageMilestones(Long contractId, String status, Integer pageNum, Integer pageSize);

    List<OaContractMilestone> listByContract(Long contractId);

    boolean saveMilestone(OaContractMilestone milestone);

    boolean updateMilestone(OaContractMilestone milestone);

    boolean removeMilestone(Long id);

    /** 标记里程碑完成（写 actual_date + status=DONE）。 */
    boolean completeMilestone(Long id, String remark);

    Page<OaContractPaymentSchedule> pagePayments(Long contractId, String status, Integer pageNum, Integer pageSize);

    List<OaContractPaymentSchedule> listPaymentsByContract(Long contractId);

    boolean savePayment(OaContractPaymentSchedule schedule);

    boolean updatePayment(OaContractPaymentSchedule schedule);

    boolean removePayment(Long id);

    /** 标记付款完成（写 actual_date / actual_amount / status=PAID）。 */
    boolean payPayment(Long id, java.math.BigDecimal actualAmount, String remark);

    /**
     * 扫描所有租户内 PENDING/IN_PROGRESS 且 planned_date < now 的里程碑、付款节点，输出风险卡片明细，
     * 供 WorkplaceServiceImpl.loadRiskItems 注入工作台。
     *
     * 字段约定:
     * - id: milestone:{milestoneId} 或 payment:{paymentId}
     * - title, description, level (HIGH/MEDIUM), businessType=CONTRACT_MILESTONE/CONTRACT_PAYMENT, businessId=contractId
     */
    List<DynamicMapVO> loadOverdueRiskItems(int limit);
}
