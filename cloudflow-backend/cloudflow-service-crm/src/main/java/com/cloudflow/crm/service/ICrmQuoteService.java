package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmQuote;

public interface ICrmQuoteService extends IService<CrmQuote> {

    PageResult<CrmQuote> queryPage(CrmQuote query, PageQuery pageQuery);

    CrmQuote getQuoteDetail(Long quoteId);

    boolean createQuote(CrmQuote quote);

    boolean updateQuote(CrmQuote quote);

    boolean submitQuote(Long quoteId);

    boolean sendQuote(Long quoteId);

    boolean acceptQuote(Long quoteId);

    boolean expireQuote(Long quoteId);

    Long createContractDraft(Long quoteId);
}
