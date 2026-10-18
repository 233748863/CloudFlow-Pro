package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.ContractSignDTO;
import com.cloudflow.oa.domain.dto.ContractTermConfirmDTO;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.IOaRiskAlertService;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.util.OaContractConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class OaContractFulfilmentService {
    private final OaContractMapper contracts;
    private final OaContractFulfilmentTermMapper terms;
    private final OaIdentityReferenceMapper identities;
    private final OaOrganizationService organization;
    private final OaReminderService reminders;
    private final IOaRiskAlertService risks;
    private final IOaTraceEventService trace;
    private final ObjectMapper json;
    private final SysConfigHelper config;
    private final OaClientIpResolver ipResolver;
    private final PlatformTransactionManager transactionManager;
    private final OaPrivateFileStorageService files;
    private final OaContractPerformanceService performance;
    private final ContractPortalSelectionMaintenance portalSelections;
    private final SysAuditLogMapper audits;

    public List<OaContractFulfilmentTerm> terms(Long contractId) {
        OaRecordSupport.active(contracts.selectById(contractId));
        return terms.selectList(new LambdaQueryWrapper<OaContractFulfilmentTerm>().eq(OaContractFulfilmentTerm::getTenantId, OaRecordSupport.tenantId())
                .eq(OaContractFulfilmentTerm::getContractId, contractId).eq(OaContractFulfilmentTerm::getDeleted, 0).orderByAsc(OaContractFulfilmentTerm::getSortNo, OaContractFulfilmentTerm::getTermNo));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存合同履约条款", spel = "#term.contractId")
    public Long saveTerm(OaContractFulfilmentTerm term) {
        OaContract contract = editableContract(term.getContractId());
        if (Integer.valueOf(1).equals(contract.getSignedFlag())) throw new IllegalArgumentException("已签署合同的条款定义已锁定");
        normalizeTerm(term);
        if (term.getResponsibleId() != null) term.setResponsibleName(OaRecordSupport.require(identities.user(term.getResponsibleId(), OaRecordSupport.tenantId()), "条款责任人不存在或已停用").getName());
        else term.setResponsibleName(null);
        if (term.getTermNo() == null) term.setTermNo(terms(contract.getContractId()).stream().mapToInt(OaContractFulfilmentTerm::getTermNo).max().orElse(0) + 1);
        if (term.getTermNo() <= 0) throw new IllegalArgumentException("条款序号必须为正整数");
        OaContractFulfilmentTerm previous = term.getTermId() == null ? null : OaRecordSupport.active(terms.selectForUpdate(term.getTermId(), OaRecordSupport.tenantId()));
        if (previous == null) {
            previous = terms.selectByNumberIncludingDeleted(contract.getContractId(), OaRecordSupport.tenantId(), term.getTermNo());
            if (previous != null) {
                if (Integer.valueOf(0).equals(previous.getDeleted())) throw new IllegalArgumentException("条款序号重复");
                portalSelections.forget(contract.getContractId(), ContractPortalSelectionMaintenance.Kind.TERM, previous.getTermId());
                OaRecordSupport.touch(previous); OaRecordSupport.saved(terms.updateDeletionState(previous, 1, 0));
                previous.setVersion(previous.getVersion() + 1);
                previous.setDeleted(0); term.setTermId(previous.getTermId()); term.setVersion(previous.getVersion());
            }
        }
        if (previous == null) OaRecordSupport.create(term, "termId");
        else {
            OaRecordSupport.same(previous.getContractId(), term.getContractId(), "条款不能更换合同");
            if (!java.util.Objects.equals(term.getVersion(), previous.getVersion())) {
                throw new ServiceException("记录已修改，请刷新核对最新条款后重试", 409);
            }
            if (OaContractFulfilmentCalculator.done(previous)) throw new IllegalArgumentException("已履约或豁免条款不能修改定义");
            OaRecordSupport.update(term, previous);
        }
        term.setFulfilledFlag(0); term.setFulfilledDate(null); term.setFulfilledBy(null); term.setFulfilledByName(null);
        term.setWaivedFlag(0); term.setWaivedReason(null); term.setEvidenceFileUrl(null); term.setEvidenceRemark(null);
        term.setOverdueFlag(OaContractFulfilmentCalculator.overdue(term, LocalDate.now()) ? 1 : 0);
        if (term.getTermId() == null) OaRecordSupport.saved(terms.insert(term)); else OaRecordSupport.saved(terms.updateById(term));
        refresh(contract.getContractId()); record(contract.getContractId(), term.getTermId(), "TERM_SAVED", "履约条款变更", term);
        return term.getTermId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除合同履约条款", highRisk = true, spel = "#id")
    public void removeTerm(Long id) {
        OaContractFulfilmentTerm reference = OaRecordSupport.active(terms.selectById(id));
        OaContract contract = editableContract(reference.getContractId());
        OaContractFulfilmentTerm term = OaRecordSupport.active(terms.selectForUpdate(id, OaRecordSupport.tenantId()));
        if (Integer.valueOf(1).equals(contract.getSignedFlag()) || OaContractFulfilmentCalculator.done(term)) throw new IllegalArgumentException("签署后的条款或已有履约记录的条款不能删除");
        portalSelections.forget(contract.getContractId(), ContractPortalSelectionMaintenance.Kind.TERM, id);
        OaRecordSupport.touch(term); OaRecordSupport.saved(terms.updateDeletionState(term, 0, 1));
        term.setDeleted(1); term.setVersion(term.getVersion() + 1);
        refresh(contract.getContractId()); record(contract.getContractId(), id, "TERM_REMOVED", "移除履约条款", term);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "确认合同条款履约", spel = "#id")
    public void confirmTerm(Long id, ContractTermConfirmDTO request) {
        OaContractFulfilmentTerm reference = OaRecordSupport.active(terms.selectById(id));
        OaContract contract = OaRecordSupport.active(contracts.selectForUpdate(reference.getContractId(), OaRecordSupport.tenantId()));
        if (Set.of("TERMINATED", "CANCELLED").contains(contract.getStatus())) throw new IllegalArgumentException("已终止合同不能办理履约");
        OaContractFulfilmentTerm term = OaRecordSupport.active(terms.selectForUpdate(id, OaRecordSupport.tenantId()));
        assertTermAccess(contract, term);
        if (OaContractFulfilmentCalculator.done(term)) return;
        if (request.getEvidenceFileUrl() != null && !request.getEvidenceFileUrl().isBlank()) files.assertOwned(OaPrivateFileStorageService.Kind.CONTRACT_EVIDENCE, request.getEvidenceFileUrl(), UserContext.getUserId());
        LocalDate date = OaRecordSupport.require(request.getFulfilledDate(), "履约日期不能为空");
        if (date.isAfter(LocalDate.now())) throw new IllegalArgumentException("履约日期不能在未来");
        term.setFulfilledFlag(1); term.setFulfilledDate(date); term.setFulfilledBy(UserContext.getUserId()); term.setFulfilledByName(OaRecordSupport.userName());
        term.setEvidenceFileUrl(request.getEvidenceFileUrl()); term.setEvidenceRemark(request.getEvidenceRemark()); term.setOverdueFlag(0);
        OaRecordSupport.touch(term); OaRecordSupport.saved(terms.updateById(term)); refresh(contract.getContractId()); record(contract.getContractId(), id, "TERM_FULFILLED", "确认条款履约", term);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "豁免合同履约条款", highRisk = true, spel = "#id")
    public void waiveTerm(Long id, ContractTermConfirmDTO request) {
        OaContractFulfilmentTerm reference = OaRecordSupport.active(terms.selectById(id));
        OaContract contract = editableContract(reference.getContractId());
        OaContractFulfilmentTerm term = OaRecordSupport.active(terms.selectForUpdate(id, OaRecordSupport.tenantId()));
        if (OaContractFulfilmentCalculator.done(term)) throw new IllegalArgumentException("条款已履约或已豁免");
        term.setWaivedFlag(1); term.setWaivedReason(OaRecordSupport.text(request.getWaivedReason(), 500, "豁免原因")); term.setOverdueFlag(0);
        OaRecordSupport.touch(term); OaRecordSupport.saved(terms.updateById(term)); refresh(contract.getContractId()); record(contract.getContractId(), id, "TERM_WAIVED", "豁免履约条款", term);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "合同签署留痕", highRisk = true, spel = "#id")
    public OaClientIpResolver.Resolution sign(Long id, ContractSignDTO request, HttpServletRequest http) {
        OaContract contract = editableContract(id);
        if (Integer.valueOf(1).equals(contract.getSignedFlag())) throw new ServiceException("合同已签署，签署记录不能覆盖", 409);
        if (!Set.of("APPROVED", "SEALING", "SEALED", "ACTIVE").contains(contract.getStatus())) throw new IllegalArgumentException("合同审批通过后才能签署");
        contract.setSignMethod(OaRecordSupport.code(request.getSignMethod(), "OFFLINE", Set.of("OFFLINE", "ESIGN", "SCAN")));
        files.assertOwned(OaPrivateFileStorageService.Kind.CONTRACT_SIGNED, request.getSignedFileUrl(), UserContext.getUserId());
        contract.setSignedFileUrl(request.getSignedFileUrl());
        contract.setCounterpartySignee(OaRecordSupport.text(request.getCounterpartySignee(), 64, "对方签署人"));
        contract.setCounterpartySignTime(OaRecordSupport.require(request.getCounterpartySignTime(), "对方签署时间不能为空"));
        if (contract.getCounterpartySignTime().isAfter(LocalDateTime.now())) throw new IllegalArgumentException("对方签署时间不能在未来");
        contract.setCounterpartySignTime(contract.getCounterpartySignTime().withNano(0));
        contract.setSignPlace(request.getSignPlace() == null || request.getSignPlace().isBlank() ? null : OaRecordSupport.text(request.getSignPlace(), 200, "签署地点"));
        contract.setSignRemark(request.getSignRemark() == null || request.getSignRemark().isBlank() ? null : OaRecordSupport.text(request.getSignRemark(), 500, "签署备注"));
        OaClientIpResolver.Resolution address = ipResolver.resolve(http);
        contract.setSignedFlag(1); contract.setOurSigneeId(UserContext.getUserId()); contract.setOurSigneeName(OaRecordSupport.userName()); contract.setOurSignTime(LocalDateTime.now().withNano(0)); contract.setOurSignIp(address.ip());
        OaRecordSupport.touch(contract); OaRecordSupport.saved(contracts.updateById(contract));
        if (address.warning()) log.warn("合同签署IP为内网或网关地址，真实客户端地址尚未确认，contractId={}, ip={}", id, address.ip());
        record(id, null, "CONTRACT_SIGNED", address.warning() ? "签署完成，IP取证有效性待确认" : "签署完成", contract);
        performance.synchronize(id);
        return address;
    }

    @Transactional(rollbackFor = Exception.class)
    public void refresh(Long contractId) {
        OaContract contract = OaRecordSupport.active(contracts.selectForUpdate(contractId, OaRecordSupport.tenantId()));
        List<OaContractFulfilmentTerm> items = terms(contractId);
        long completed = items.stream().filter(OaContractFulfilmentCalculator::done).count();
        contract.setTotalTermCount(items.size()); contract.setFulfilledTermCount(Math.toIntExact(completed));
        contract.setFulfilmentProgress(items.isEmpty() ? BigDecimal.ZERO : BigDecimal.valueOf(completed).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(items.size()), 2, RoundingMode.HALF_UP));
        contract.setFulfilmentStatus(OaContractFulfilmentCalculator.status(contract, items, LocalDate.now()));
        OaRecordSupport.touch(contract); OaRecordSupport.saved(contracts.updateById(contract));
        for (OaContractFulfilmentTerm term : items) {
            int overdue = OaContractFulfilmentCalculator.overdue(term, LocalDate.now()) ? 1 : 0;
            if (!Integer.valueOf(overdue).equals(term.getOverdueFlag())) { term.setOverdueFlag(overdue); OaRecordSupport.touch(term); OaRecordSupport.saved(terms.updateById(term)); }
        }
    }

    @Audit(name = "扫描合同履约风险")
    public int scanDue() {
        List<OaContract> tracked = contracts.selectList(new LambdaQueryWrapper<OaContract>().eq(OaContract::getTenantId, OaRecordSupport.tenantId()).eq(OaContract::getDeleted, 0)
                .eq(OaContract::getRequiresFulfilmentFlag, 1).in(OaContract::getStatus, OaContractConstants.FULFILMENT_ELIGIBLE_STATUSES).orderByAsc(OaContract::getContractId));
        int count = 0;
        for (OaContract contract : tracked) count += new TransactionTemplate(transactionManager).execute(transaction -> scanContract(contract.getContractId()));
        return count;
    }

    private int scanContract(Long id) {
        OaContract contract = contracts.selectForUpdate(id, OaRecordSupport.tenantId());
        if (contract == null || !Integer.valueOf(1).equals(contract.getRequiresFulfilmentFlag())
                || contract.getStatus() == null
                || !OaContractConstants.FULFILMENT_ELIGIBLE_STATUSES.contains(contract.getStatus())) return 0;
        refresh(id); contract = OaRecordSupport.active(contracts.selectForUpdate(id, OaRecordSupport.tenantId()));
        int count = 0; int days = config.getConfigInt("sys.oa.contract.fulfilmentReminderDays", 7);
        if (days < 0) throw new IllegalStateException("合同提前提醒天数不能为负数");
        for (OaContractFulfilmentTerm term : terms(id)) {
            if (OaContractFulfilmentCalculator.done(term) || term.getDeadlineDate() == null || term.getDeadlineDate().isAfter(LocalDate.now().plusDays(days))) continue;
            Long recipient = term.getResponsibleId() == null ? contract.getOwnerId() : term.getResponsibleId();
            OaRecordSupport.require(identities.user(recipient, OaRecordSupport.tenantId()), "履约提醒责任人未正确配置");
            reminders.send(recipient, "CONTRACT_TERM", term.getTermId().toString(), term.getDeadlineDate() + ":" + term.getOverdueFlag(), "合同履约到期提醒", contract.getContractName() + "：" + term.getRequirement()); count++;
            if (Integer.valueOf(1).equals(term.getOverdueFlag())) createRisk(contract, "TERM_OVERDUE_" + term.getTermId(), "履约条款逾期：" + term.getTermNo(), recipient);
        }
        if ("BREACHED".equals(contract.getFulfilmentStatus())) {
            createRisk(contract, "FULFILMENT_BREACHED", "合同整体履约期限已逾期", contract.getOwnerId());
            reminders.send(contract.getOwnerId(), "CONTRACT_BREACHED", id.toString(), contract.getFulfilmentDeadline().toString(), "合同履约违约告警", contract.getContractName());
            OaIdentityReference manager = organization.manager(contract.getOwnerId());
            if (manager != null) reminders.send(manager.getId(), "CONTRACT_BREACHED", id.toString(), contract.getFulfilmentDeadline().toString(), "下属合同履约违约告警", contract.getContractName());
            else log.warn("合同负责人的上级未配置，违约告警已发送负责人，contractId={}, ownerId={}", id, contract.getOwnerId());
        }
        return count;
    }

    private void createRisk(OaContract contract, String code, String title, Long ownerId) {
        OaIdentityReference owner = OaRecordSupport.require(identities.user(ownerId, OaRecordSupport.tenantId()), "风险负责人不存在");
        OaRiskAlert risk = new OaRiskAlert(); risk.setTenantId(OaRecordSupport.tenantId()); risk.setBusinessType("CONTRACT"); risk.setBusinessId(contract.getContractId());
        risk.setRiskCode(code); risk.setRiskName(title); risk.setRiskLevel("HIGH"); risk.setOwnerId(owner.getId()); risk.setOwnerName(owner.getName()); risks.createRuleRiskIfAbsent(risk);
    }

    public OaPrivateFileStorageService.UploadedFile uploadEvidence(Long termId, org.springframework.web.multipart.MultipartFile file) {
        getReadableEvidenceTerm(termId);
        return files.upload(OaPrivateFileStorageService.Kind.CONTRACT_EVIDENCE, file);
    }

    public org.springframework.http.ResponseEntity<byte[]> downloadEvidence(Long termId) {
        OaContractFulfilmentTerm term = getReadableEvidenceTerm(termId);
        return files.download(OaPrivateFileStorageService.Kind.CONTRACT_EVIDENCE, term.getEvidenceFileUrl());
    }

    public OaContractFulfilmentTerm getReadableEvidenceTerm(Long termId) {
        Long tenantId = OaRecordSupport.tenantId();
        OaContractFulfilmentTerm term = terms.selectById(termId);
        if (term == null || !java.util.Objects.equals(term.getTenantId(), tenantId)
                || !Integer.valueOf(0).equals(term.getDeleted())) {
            throw new ServiceException("记录不存在或无权访问", 404);
        }
        OaContract contract = contracts.selectById(term.getContractId());
        if (contract == null || !java.util.Objects.equals(contract.getTenantId(), tenantId)
                || !Integer.valueOf(0).equals(contract.getDeleted())) {
            throw new ServiceException("记录不存在或无权访问", 404);
        }
        assertTermAccess(contract, term);
        return term;
    }

    public OaPrivateFileStorageService.UploadedFile uploadSignedFile(Long contractId, org.springframework.web.multipart.MultipartFile file) {
        OaContract contract = OaRecordSupport.active(contracts.selectById(contractId)); DataScopeUtils.assertOwnership(contract, OaContract::getOwnerId, "合同");
        return files.upload(OaPrivateFileStorageService.Kind.CONTRACT_SIGNED, file);
    }

    public org.springframework.http.ResponseEntity<byte[]> downloadSignedFile(Long contractId) {
        OaContract contract = getReadableSignedContract(contractId);
        return files.download(OaPrivateFileStorageService.Kind.CONTRACT_SIGNED, contract.getSignedFileUrl());
    }

    public OaContract getReadableSignedContract(Long contractId) {
        OaContract contract = contracts.selectById(contractId);
        if (contract == null || !java.util.Objects.equals(contract.getTenantId(), OaRecordSupport.tenantId())
                || !Integer.valueOf(0).equals(contract.getDeleted())) {
            throw new ServiceException("记录不存在或无权访问", 404);
        }
        DataScopeUtils.assertOwnership(contract, OaContract::getOwnerId, "合同");
        return contract;
    }

    private void assertTermAccess(OaContract contract, OaContractFulfilmentTerm term) {
        if (!java.util.Objects.equals(UserContext.getUserId(), term.getResponsibleId())) DataScopeUtils.assertOwnership(contract, OaContract::getOwnerId, "合同履约条款");
    }

    private OaContract editableContract(Long id) {
        OaContract contract = OaRecordSupport.active(contracts.selectForUpdate(id, OaRecordSupport.tenantId()));
        DataScopeUtils.assertOwnership(contract, OaContract::getOwnerId, "合同");
        if (Set.of("TERMINATED", "CANCELLED").contains(contract.getStatus())) throw new IllegalArgumentException("已终止合同不能再办理履约或签署");
        return contract;
    }

    public static void normalizeTerm(OaContractFulfilmentTerm term) {
        term.setTermCategory(OaRecordSupport.code(term.getTermCategory(), "OTHER", Set.of("DELIVERY", "PAYMENT", "SERVICE", "QUALITY", "CONFIDENTIALITY", "IP", "OTHER")));
        term.setResponsibleParty(OaRecordSupport.code(term.getResponsibleParty(), "OUR", Set.of("OUR", "COUNTERPARTY", "BOTH")));
        term.setTermContent(OaRecordSupport.text(term.getTermContent(), 10000, "条款内容")); term.setRequirement(OaRecordSupport.text(term.getRequirement(), 10000, "履约要求")); term.setSortNo(term.getSortNo() == null ? 0 : term.getSortNo());
    }

    private void record(Long contractId, Long termId, String type, String title, Object value) {
        try {
            trace.record(OaRecordSupport.tenantId(), "CONTRACT", contractId, "CONTRACT_TERM", termId, type, title, title,
                    UserContext.getUserId(), OaRecordSupport.userName(), json.writeValueAsString(value));
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("contractId", contractId); snapshot.put("termId", termId);
            snapshot.put("operatorId", UserContext.getUserId()); snapshot.put("record", value);
            boolean highRisk = Set.of("TERM_REMOVED", "TERM_WAIVED", "CONTRACT_SIGNED").contains(type);
            SysAuditLogEntity audit = new SysAuditLogEntity(); audit.setTenantId(OaRecordSupport.tenantId());
            audit.setBizModule("oa"); audit.setAuditField(type);
            audit.setAuditName(switch (type) {
                case "TERM_SAVED" -> "保存合同履约条款";
                case "TERM_REMOVED" -> "删除合同履约条款";
                case "TERM_FULFILLED" -> "确认合同条款履约";
                case "TERM_WAIVED" -> "豁免合同履约条款";
                case "CONTRACT_SIGNED" -> "合同签署留痕";
                default -> title;
            });
            audit.setAfterJson(json.writeValueAsString(snapshot)); audit.setCreateBy(OaRecordSupport.userName());
            audit.setCreateTime(LocalDateTime.now()); audit.setHighRisk(highRisk ? 1 : 0); audit.setRiskLevel(highRisk ? "HIGH" : "NORMAL");
            OaRecordSupport.saved(audits.insert(audit));
        }
        catch (Exception exception) { throw new IllegalStateException("履约事件保存失败", exception); }
    }
}
