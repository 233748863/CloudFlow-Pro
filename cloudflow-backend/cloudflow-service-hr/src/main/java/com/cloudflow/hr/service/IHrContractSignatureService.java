package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrContractSignaturePayload;

/**
 * 电子合同签署服务。
 *
 * <p>员工在 ESS 端发起签署 → 走 wf_hr_contract_sign 工作流 → APPROVED 回调把
 * hr_contract_signature.sign_status 切到 SIGNED，并联动 hr_employee_contract.sign_status。
 */
public interface IHrContractSignatureService {

    /**
     * 员工发起合同签署申请，返回新建 hr_contract_signature.id。
     */
    Long requestSign(Long contractId, HrContractSignaturePayload payload);

    /**
     * 员工或管理员撤销签署申请（仅在 PENDING / APPROVING 状态可撤销）。
     */
    void cancel(Long id);

    /**
     * 工作流回调链路在 APPROVED 之后调用，写 sign_time / 同步 hr_employee_contract。
     */
    void onSigned(Long id);

    /**
     * 工作流回调把签署单状态写回主合同，避免 hr_employee_contract 卡在旧状态。
     */
    void syncContractSignStatus(Long id, String signStatus);
}
