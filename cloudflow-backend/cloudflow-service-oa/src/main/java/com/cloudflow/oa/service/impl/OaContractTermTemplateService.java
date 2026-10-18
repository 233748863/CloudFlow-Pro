package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
public class OaContractTermTemplateService {
    private final OaContractTemplateMapper templates;
    private final OaContractTemplateTermMapper templateTerms;
    private final OaContractMapper contracts;
    private final OaContractFulfilmentService fulfilment;

    public List<OaContractTemplateTerm> terms(Long templateId) {
        OaRecordSupport.active(templates.selectById(templateId));
        return templateTerms.selectList(new LambdaQueryWrapper<OaContractTemplateTerm>().eq(OaContractTemplateTerm::getTenantId, OaRecordSupport.tenantId())
                .eq(OaContractTemplateTerm::getTemplateId, templateId).eq(OaContractTemplateTerm::getDeleted, 0).orderByAsc(OaContractTemplateTerm::getSortNo, OaContractTemplateTerm::getTermNo));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存合同模板履约条款", spel = "#templateId")
    public void saveTerms(Long templateId, List<OaContractTemplateTerm> items) {
        OaRecordSupport.active(templates.selectForUpdate(templateId, OaRecordSupport.tenantId()));
        if (items == null || items.size() > 500) throw new IllegalArgumentException("模板条款不能超过500条");
        List<OaContractTemplateTerm> previousItems = templateTerms.selectByTemplateIncludingDeleted(templateId, OaRecordSupport.tenantId());
        Set<Integer> numbers = new HashSet<>();
        for (OaContractTemplateTerm item : items) {
            if (item.getTermNo() == null || item.getTermNo() <= 0 || !numbers.add(item.getTermNo())) throw new IllegalArgumentException("模板条款序号必须为不重复的正整数");
            OaContractFulfilmentTerm check = new OaContractFulfilmentTerm(); check.setTermCategory(item.getTermCategory()); check.setTermContent(item.getTermContent()); check.setRequirement(item.getRequirement()); check.setResponsibleParty(item.getResponsibleParty()); check.setSortNo(item.getSortNo()); OaContractFulfilmentService.normalizeTerm(check);
            item.setTermCategory(check.getTermCategory()); item.setTermContent(check.getTermContent()); item.setRequirement(check.getRequirement()); item.setResponsibleParty(check.getResponsibleParty()); item.setSortNo(check.getSortNo()); item.setTemplateId(templateId);
            OaContractTemplateTerm previous = previousItems.stream().filter(record -> Objects.equals(record.getTermNo(), item.getTermNo())).findFirst().orElse(null);
            if (previous == null) { OaRecordSupport.create(item, "templateTermId"); OaRecordSupport.saved(templateTerms.insert(item)); }
            else {
                if (Integer.valueOf(1).equals(previous.getDeleted())) {
                    OaRecordSupport.touch(previous); OaRecordSupport.saved(templateTerms.updateDeletionState(previous, 1, 0));
                    previous.setDeleted(0);
                }
                item.setTemplateTermId(previous.getTemplateTermId()); OaRecordSupport.update(item, previous); OaRecordSupport.saved(templateTerms.updateById(item));
            }
        }
        for (OaContractTemplateTerm previous : previousItems) {
            if (Integer.valueOf(0).equals(previous.getDeleted()) && !numbers.contains(previous.getTermNo())) {
                OaRecordSupport.touch(previous); OaRecordSupport.saved(templateTerms.updateDeletionState(previous, 0, 1));
                previous.setDeleted(1);
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "合同应用履约模板", spel = "#contractId")
    public void applyTemplate(Long contractId, Long templateId) {
        OaContract contract = OaRecordSupport.active(contracts.selectForUpdate(contractId, OaRecordSupport.tenantId()));
        DataScopeUtils.assertOwnership(contract, OaContract::getOwnerId, "合同");
        OaContractTemplate template = OaRecordSupport.active(templates.selectForUpdate(templateId, OaRecordSupport.tenantId()));
        if (!"ACTIVE".equals(template.getStatus())) throw new IllegalArgumentException("合同模板已停用");
        if (Integer.valueOf(1).equals(contract.getSignedFlag())) throw new IllegalArgumentException("签署后不能应用模板");
        if (!fulfilment.terms(contractId).isEmpty()) throw new IllegalArgumentException("合同已有履约条款，不能重复套用模板");
        List<OaContractTemplateTerm> items = terms(templateId);
        if (items.isEmpty()) return;
        if (items.stream().anyMatch(item -> item.getDeadlineOffsetDays() != null)) OaRecordSupport.require(contract.getStartDate(), "换算模板期限需要合同开始日期");
        contract.setRequiresFulfilmentFlag(1); OaRecordSupport.touch(contract); OaRecordSupport.saved(contracts.updateById(contract));
        for (OaContractTemplateTerm item : items) {
            OaContractFulfilmentTerm term = new OaContractFulfilmentTerm(); term.setContractId(contractId); term.setTermNo(item.getTermNo()); term.setTermCategory(item.getTermCategory()); term.setTermContent(item.getTermContent()); term.setRequirement(item.getRequirement()); term.setResponsibleParty(item.getResponsibleParty()); term.setResponsibleId(contract.getOwnerId()); term.setSortNo(item.getSortNo());
            term.setDeadlineDate(item.getDeadlineOffsetDays() == null ? null : contract.getStartDate().plusDays(item.getDeadlineOffsetDays())); fulfilment.saveTerm(term);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "合同条款另存模板", spel = "#contractId")
    public void saveFromContract(Long contractId, Long templateId) {
        OaContract contract = OaRecordSupport.active(contracts.selectForUpdate(contractId, OaRecordSupport.tenantId()));
        DataScopeUtils.assertOwnership(contract, OaContract::getOwnerId, "合同");
        List<OaContractTemplateTerm> result = new ArrayList<>();
        for (OaContractFulfilmentTerm term : fulfilment.terms(contractId)) {
            OaContractTemplateTerm item = new OaContractTemplateTerm(); item.setTermNo(term.getTermNo()); item.setTermCategory(term.getTermCategory()); item.setTermContent(term.getTermContent()); item.setRequirement(term.getRequirement()); item.setResponsibleParty(term.getResponsibleParty()); item.setSortNo(term.getSortNo());
            if (term.getDeadlineDate() != null) item.setDeadlineOffsetDays(Math.toIntExact(ChronoUnit.DAYS.between(OaRecordSupport.require(contract.getStartDate(), "合同开始日期不能为空"), term.getDeadlineDate())));
            result.add(item);
        }
        saveTerms(templateId, result);
    }
}
