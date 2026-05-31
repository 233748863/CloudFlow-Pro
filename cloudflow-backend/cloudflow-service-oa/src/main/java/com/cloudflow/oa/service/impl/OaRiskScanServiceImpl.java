package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.service.IOaRiskAlertService;
import com.cloudflow.oa.service.IOaRiskScanService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.remote.RemoteBusinessRuleService;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.oa.util.OaContractConstants;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * OA 风险规则扫描服务实现。
 */
@Service
@RequiredArgsConstructor
public class OaRiskScanServiceImpl implements IOaRiskScanService {

    /** 兜底默认值：合同高额阈值（实际值从 sys.oa.contract.highAmountThreshold 读取） */
    private static final BigDecimal DEFAULT_HIGH_AMOUNT_THRESHOLD = new BigDecimal("100000");

    private final OaContractMapper contractMapper;
    private final OaSealApplicationMapper sealApplicationMapper;
    private final IOaRiskAlertService oaRiskAlertService;
    private final ISysNoticeService sysNoticeService;
    private final RemoteBusinessRuleService remoteBusinessRuleService;
    private final SysConfigHelper sysConfigHelper;

    private BigDecimal highAmountThreshold() {
        return new BigDecimal(sysConfigHelper.getConfigValue(
                "sys.oa.contract.highAmountThreshold",
                DEFAULT_HIGH_AMOUNT_THRESHOLD.toPlainString()));
    }

    @Override
    public int scanContractRisks() {
        int created = 0;
        created += scanExpiringContracts();
        created += scanPendingApprovals();
        created += scanApprovedUnsealed();
        created += scanHighAmountMissingAttachment();
        created += scanOverdueSealReturn();
        created += scanSealedUnarchived();
        return created;
    }

    private int scanExpiringContracts() {
        LocalDate today = LocalDate.now();
        List<OaContract> contracts = contractMapper.selectList(new LambdaQueryWrapper<OaContract>()
                .eq(OaContract::getDeleted, "0")
                .isNotNull(OaContract::getEndDate)
                .between(OaContract::getEndDate, today, today.plusDays(30))
                .in(OaContract::getStatus,
                        OaContractConstants.CONTRACT_STATUS_APPROVED,
                        OaContractConstants.CONTRACT_STATUS_SEALING,
                        OaContractConstants.CONTRACT_STATUS_SEALED,
                        OaContractConstants.CONTRACT_STATUS_ACTIVE));
        int created = 0;
        for (OaContract contract : contracts) {
            if (createRisk(contract, "CONTRACT_EXPIRING", "合同30天内到期", OaContractConstants.RISK_LEVEL_MEDIUM,
                    "合同将在 " + contract.getEndDate() + " 到期")) {
                created++;
            }
        }
        return created;
    }

    private int scanPendingApprovals() {
        LocalDateTime threshold = LocalDateTime.now().minusHours(48);
        List<OaContract> contracts = contractMapper.selectList(new LambdaQueryWrapper<OaContract>()
                .eq(OaContract::getDeleted, "0")
                .eq(OaContract::getStatus, OaContractConstants.CONTRACT_STATUS_PENDING)
                .le(OaContract::getUpdateTime, threshold));
        int created = 0;
        for (OaContract contract : contracts) {
            if (createRisk(contract, "CONTRACT_APPROVAL_STALLED", "合同审批超过48小时", OaContractConstants.RISK_LEVEL_HIGH,
                    "合同审批停留超过48小时")) {
                created++;
            }
        }
        return created;
    }

    private int scanApprovedUnsealed() {
        LocalDateTime threshold = LocalDateTime.now().minusDays(3);
        List<OaContract> contracts = contractMapper.selectList(new LambdaQueryWrapper<OaContract>()
                .eq(OaContract::getDeleted, "0")
                .eq(OaContract::getStatus, OaContractConstants.CONTRACT_STATUS_APPROVED)
                .le(OaContract::getUpdateTime, threshold));
        int created = 0;
        for (OaContract contract : contracts) {
            if (createRisk(contract, "CONTRACT_APPROVED_UNSEALED", "合同审批通过3天未用印", OaContractConstants.RISK_LEVEL_HIGH,
                    "合同审批通过后超过3天未绑定用印")) {
                created++;
            }
        }
        return created;
    }

    private int scanHighAmountMissingAttachment() {
        BusinessRuleDTO rule = resolveContractRiskRule();
        BigDecimal threshold = rule == null || rule.getThresholdValue() == null ? highAmountThreshold() : rule.getThresholdValue();
        List<OaContract> contracts = contractMapper.selectList(new LambdaQueryWrapper<OaContract>()
                .eq(OaContract::getDeleted, "0")
                .ge(OaContract::getAmount, threshold)
                .and(wrapper -> wrapper.isNull(OaContract::getAttachmentUrl).or().eq(OaContract::getAttachmentUrl, "")));
        int created = 0;
        for (OaContract contract : contracts) {
            recordRuleHit(rule, contract, threshold);
            if (createRisk(contract, "CONTRACT_HIGH_AMOUNT_ATTACHMENT_MISSING", "高额合同缺少附件", OaContractConstants.RISK_LEVEL_HIGH,
                    "合同金额大于" + threshold + "且未上传合同附件")) {
                created++;
            }
        }
        return created;
    }

    private int scanOverdueSealReturn() {
        LocalDateTime now = LocalDateTime.now();
        List<OaSealApplication> applications = sealApplicationMapper.selectList(new LambdaQueryWrapper<OaSealApplication>()
                .eq(OaSealApplication::getDeleted, "0")
                .isNotNull(OaSealApplication::getContractId)
                .in(OaSealApplication::getStatus, OaBorrowConstants.STATUS_BORROWED, OaBorrowConstants.STATUS_OVERDUE)
                .lt(OaSealApplication::getExpectedReturnTime, now));
        int created = 0;
        for (OaSealApplication application : applications) {
            OaContract contract = contractMapper.selectById(application.getContractId());
            if (contract == null || !Integer.valueOf(0).equals(contract.getDeleted())) {
                continue;
            }
            if (createRisk(contract, "SEAL_RETURN_OVERDUE", "用印逾期未归还", OaContractConstants.RISK_LEVEL_CRITICAL,
                    "用印申请 " + application.getApplicationNo() + " 已超过预计归还时间")) {
                created++;
            }
        }
        return created;
    }

    private BusinessRuleDTO resolveContractRiskRule() {
        try {
            var result = remoteBusinessRuleService.getEffectiveRule("oa.contract.risk.threshold");
            if (result != null && result.isSuccess()) {
                BusinessRuleDTO rule = result.getData();
                if (rule != null && Integer.valueOf(1).equals(rule.getEnabled()) && rule.getThresholdValue() != null) {
                    return rule;
                }
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }

    private void recordRuleHit(BusinessRuleDTO rule, OaContract contract, BigDecimal threshold) {
        if (contract == null) {
            return;
        }
        try {
            BusinessRuleHitRecordDTO record = new BusinessRuleHitRecordDTO();
            record.setTenantId(contract.getTenantId());
            record.setRuleCode(rule == null ? "oa.contract.risk.threshold" : rule.getRuleCode());
            record.setBusinessType(OaContractConstants.BUSINESS_TYPE_CONTRACT);
            record.setBusinessId(contract.getContractId());
            record.setThresholdValue(threshold);
            record.setActualValue(contract.getAmount() == null ? BigDecimal.ZERO : contract.getAmount());
            String effect = rule == null || !StringUtils.hasText(rule.getEffect()) ? "WARN" : rule.getEffect().trim().toUpperCase();
            record.setEffect(effect);
            record.setHitResult(effect);
            remoteBusinessRuleService.recordHit(record);
        } catch (Exception ignored) {
            // 风险扫描不能因治理留痕失败而中断。
        }
    }

    private int scanSealedUnarchived() {
        List<OaContract> contracts = contractMapper.selectList(new LambdaQueryWrapper<OaContract>()
                .eq(OaContract::getDeleted, "0")
                .eq(OaContract::getStatus, OaContractConstants.CONTRACT_STATUS_SEALED)
                .and(wrapper -> wrapper.isNull(OaContract::getArchiveAttachmentUrl).or().eq(OaContract::getArchiveAttachmentUrl, "")));
        int created = 0;
        for (OaContract contract : contracts) {
            if (createRisk(contract, "CONTRACT_SEALED_UNARCHIVED", "合同已用印未归档", OaContractConstants.RISK_LEVEL_MEDIUM,
                    "合同已完成用印但未上传归档附件")) {
                created++;
            }
        }
        return created;
    }

    private boolean createRisk(OaContract contract, String code, String name, String level, String remark) {
        OaRiskAlert risk = new OaRiskAlert();
        risk.setTenantId(contract.getTenantId());
        risk.setBusinessType(OaContractConstants.BUSINESS_TYPE_CONTRACT);
        risk.setBusinessId(contract.getContractId());
        risk.setRiskCode(code);
        risk.setRiskName(name);
        risk.setRiskLevel(level);
        risk.setOwnerId(contract.getOwnerId());
        risk.setOwnerName(contract.getOwnerName());
        risk.setHandleRemark(remark);
        boolean created = oaRiskAlertService.createRuleRiskIfAbsent(risk);
        if (created && contract.getOwnerId() != null) {
            sysNoticeService.sendNotice(contract.getOwnerId(), "合同风险提醒",
                    contract.getContractNo() + " / " + contract.getContractName() + "：" + name,
                    "2", null, StringUtils.hasText(contract.getOwnerName()) ? contract.getOwnerName() : "risk-scan");
        }
        return created;
    }
}
