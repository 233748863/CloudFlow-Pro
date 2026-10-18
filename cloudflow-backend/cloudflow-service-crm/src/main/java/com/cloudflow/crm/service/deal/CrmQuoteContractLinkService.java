package com.cloudflow.crm.service.deal;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmQuoteContractLinkService {
    private final CrmQuoteAccessService access;
    private final CrmQuoteMapper quotes;

    @Audit(name = "关联报价与真实来源合同")
    @Transactional(rollbackFor = Exception.class)
    public Long link(Long quoteId, Long contractId) {
        CrmQuote quote = access.lockInScope(quoteId);
        CrmQuoteMapper.ContractLink contract = requireContract(quote, contractId);
        if (quote.getContractId() != null) {
            if (!Objects.equals(quote.getContractId(), contractId)) throw invalid("报价已关联其他合同，请刷新核对");
            return contractId;
        }
        quote.setContractId(contractId); quote.setContractNo(CrmRecordSupport.text(contract.contractNo(), 50, "合同编号"));
        CrmRecordSupport.touch(quote);
        CrmRecordSupport.saved(quotes.writeContractLink(quote, quote.getVersion()));
        return contractId;
    }

    @Audit(name = "接受已关联合同的报价")
    @Transactional(rollbackFor = Exception.class)
    public boolean accept(Long quoteId) {
        CrmQuote quote = access.lockInScope(quoteId);
        requireContract(quote, quote.getContractId());
        if ("ACCEPTED".equals(quote.getStatus())) return true;
        if (!"APPROVED".equals(quote.getStatus()) && !"SENT".equals(quote.getStatus())) throw invalid("当前报价状态不允许接受");
        CrmRecordSupport.touch(quote);
        CrmRecordSupport.saved(quotes.acceptLinkedContract(quote, quote.getVersion()));
        return true;
    }

    private CrmQuoteMapper.ContractLink requireContract(CrmQuote quote, Long contractId) {
        if (contractId == null || contractId <= 0) throw invalid("真实来源合同不能为空");
        CrmQuoteMapper.ContractLink contract = quotes.lockCreatedContract(quote.getQuoteId(), contractId, quote.getTenantId());
        if (contract == null || !Objects.equals(contract.customerId(), quote.getCustomerId()) || !Objects.equals(contract.currency(), quote.getCurrency()))
            throw invalid("合同来源、客户或币种与报价不一致，请核对后重试");
        return contract;
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
