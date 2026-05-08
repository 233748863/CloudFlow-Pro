package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.ReceivableInvoiceSyncDTO;
import com.cloudflow.crm.domain.vo.CrmReceivableAgingBucketVO;

import java.util.List;

public interface ICrmReceivableService extends IService<CrmReceivable> {

    PageResult<CrmReceivable> queryPage(CrmReceivable query, PageQuery pageQuery);

    boolean createReceivable(CrmReceivable receivable);

    boolean updateReceivable(CrmReceivable receivable);

    boolean confirmReceipt(Long receivableId);

    boolean bindInvoice(Long receivableId, Long invoiceId);

    boolean syncInvoiceStatus(Long receivableId, ReceivableInvoiceSyncDTO syncDTO);

    List<CrmReceivableAgingBucketVO> getAgingBuckets();
}
