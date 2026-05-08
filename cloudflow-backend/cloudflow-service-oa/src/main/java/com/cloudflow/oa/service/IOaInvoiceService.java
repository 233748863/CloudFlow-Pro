package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaInvoice;
import com.cloudflow.oa.domain.OaInvoiceWriteoff;

import java.util.List;

public interface IOaInvoiceService extends IService<OaInvoice> {

    PageResult<OaInvoice> queryPage(OaInvoice query, PageQuery pageQuery);

    boolean createInvoice(OaInvoice invoice);

    boolean updateInvoice(OaInvoice invoice);

    boolean bindInvoice(Long invoiceId, OaInvoice invoice);

    boolean writeoffInvoice(OaInvoiceWriteoff writeoff);

    boolean voidInvoice(Long invoiceId, String remark);

    List<OaInvoiceWriteoff> listWriteoffHistory(Long invoiceId);
}
