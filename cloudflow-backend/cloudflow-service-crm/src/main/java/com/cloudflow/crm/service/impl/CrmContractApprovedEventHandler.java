package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 合同审批通过后的自动化：在 OA 创建交付项目草稿与对应预算计划。
 *
 * <p>触发条件：合同 sourceType=CRM_* 且已审批通过。
 * 采用 "best effort" 策略：任一步失败只记日志，不阻塞事件 ack。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CrmContractApprovedEventHandler {

    private final RemoteOaService remoteOaService;

    public void handle(Map<String, String> body) {
        Long contractId = parseLong(body.get("contractId"));
        if (contractId == null) {
            log.warn("ContractApproved 事件缺少 contractId，忽略");
            return;
        }
        Long customerId = parseLong(body.get("customerId"));
        String customerName = normalize(body.get("customerName"));
        String contractName = normalize(body.get("contractName"));
        String contractNo = normalize(body.get("contractNo"));
        BigDecimal amount = parseDecimal(body.get("amount"));
        Long ownerId = parseLong(body.get("ownerId"));
        String ownerName = normalize(body.get("ownerName"));
        Long deptId = parseLong(body.get("deptId"));
        String deptName = normalize(body.get("deptName"));
        String sourceType = normalize(body.get("sourceType"));
        Long sourceId = parseLong(body.get("sourceId"));

        Long projectId = createProject(contractId, contractNo, contractName, customerId, customerName,
                ownerId, ownerName, deptId, deptName, amount, sourceType, sourceId);
        createBudget(projectId, contractId, contractName, amount, deptId, deptName, ownerId, ownerName);
    }

    private Long createProject(Long contractId, String contractNo, String contractName,
                               Long customerId, String customerName,
                               Long ownerId, String ownerName,
                               Long deptId, String deptName,
                               BigDecimal amount, String sourceType, Long sourceId) {
        RemoteOaService.ProjectDraftRequest payload = new RemoteOaService.ProjectDraftRequest();
        payload.setProjectName(StringUtils.hasText(contractName) ? contractName + " 交付项目"
                : (StringUtils.hasText(customerName) ? customerName + " 交付项目" : "合同交付项目"));
        payload.setProjectType("DELIVERY");
        payload.setCustomerId(customerId);
        payload.setCustomerName(customerName);
        payload.setContractId(contractId);
        payload.setContractNo(contractNo);
        payload.setOwnerId(ownerId);
        payload.setOwnerName(ownerName);
        payload.setDeptId(deptId);
        payload.setDeptName(deptName);
        payload.setBudgetAmount(amount == null ? BigDecimal.ZERO : amount);
        payload.setPriority("MEDIUM");
        payload.setStatus("DRAFT");
        payload.setRiskLevel(CrmConstants.RiskLevel.LOW);
        payload.setSourceType(StringUtils.hasText(sourceType) ? sourceType : "CRM_CONTRACT");
        payload.setSourceId(sourceId);
        payload.setSourceName(contractName);
        payload.setStartDate(LocalDate.now());
        payload.setRemark("由 CRM 合同审批通过自动生成，合同 #" + contractId);
        try {
            R<Long> response = remoteOaService.createProject("true", CrmConstants.SERVICE_NAME, payload);
            if (response == null || !response.isSuccess() || response.getData() == null) {
                log.warn("合同审批后自动建项目失败: contractId={}, msg={}", contractId,
                        response != null ? response.getMsg() : "no response");
                return null;
            }
            log.info("合同审批后自动建项目成功: contractId={}, projectId={}", contractId, response.getData());
            return response.getData();
        } catch (Exception ex) {
            log.error("合同审批后自动建项目异常: contractId={}", contractId, ex);
            return null;
        }
    }

    private void createBudget(Long projectId, Long contractId, String contractName, BigDecimal amount,
                              Long deptId, String deptName, Long ownerId, String ownerName) {
        if (amount == null || amount.signum() <= 0) {
            log.debug("合同金额为空，跳过自动建预算: contractId={}", contractId);
            return;
        }
        RemoteOaService.BudgetDraftRequest payload = new RemoteOaService.BudgetDraftRequest();
        payload.setBudgetName((StringUtils.hasText(contractName) ? contractName : "合同") + " 预算");
        payload.setFiscalYear(LocalDate.now().getYear());
        payload.setPeriodType("ANNUAL");
        if (projectId != null) {
            payload.setTargetType("PROJECT");
            payload.setTargetId(projectId);
            payload.setTargetName(contractName);
            payload.setProjectId(projectId);
            payload.setProjectName(contractName);
        } else if (deptId != null) {
            payload.setTargetType("DEPT");
            payload.setTargetId(deptId);
            payload.setTargetName(deptName);
        } else {
            log.debug("项目与部门均为空，跳过自动建预算: contractId={}", contractId);
            return;
        }
        payload.setOwnerId(ownerId);
        payload.setOwnerName(ownerName);
        payload.setDeptId(deptId);
        payload.setDeptName(deptName);
        payload.setTotalAmount(amount);

        RemoteOaService.BudgetDraftLine line = new RemoteOaService.BudgetDraftLine();
        line.setSubjectCode("SALES_DELIVERY");
        line.setSubjectName("销售交付");
        line.setAmount(amount);
        List<RemoteOaService.BudgetDraftLine> lines = new ArrayList<>();
        lines.add(line);
        payload.setLines(lines);
        payload.setRemark("由 CRM 合同审批通过自动生成，合同 #" + contractId);

        try {
            R<Void> response = remoteOaService.createBudget("true", CrmConstants.SERVICE_NAME, payload);
            if (response == null || !response.isSuccess()) {
                log.warn("合同审批后自动建预算失败: contractId={}, msg={}", contractId,
                        response != null ? response.getMsg() : "no response");
            } else {
                log.info("合同审批后自动建预算成功: contractId={}, projectId={}", contractId, projectId);
            }
        } catch (Exception ex) {
            log.error("合同审批后自动建预算异常: contractId={}", contractId, ex);
        }
    }

    private Long parseLong(String value) {
        String v = normalize(value);
        if (v == null || v.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private BigDecimal parseDecimal(String value) {
        String v = normalize(value);
        if (v == null || v.isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }
}
