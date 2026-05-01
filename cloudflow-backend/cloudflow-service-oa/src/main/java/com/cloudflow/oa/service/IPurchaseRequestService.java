package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.dto.PurchaseFromSuggestionDTO;
import com.cloudflow.oa.domain.dto.PurchaseReceiptDTO;

/**
 * 行政采购申请 Service。
 */
public interface IPurchaseRequestService extends IService<BizPurchaseRequest> {

    BizPurchaseRequest getRequestWithItems(Long id);

    String generatePurchaseNo();

    boolean createPurchase(BizPurchaseRequest purchase);

    boolean updatePurchase(BizPurchaseRequest purchase);

    boolean submitPurchase(Long id);

    boolean receivePurchase(Long id, PurchaseReceiptDTO receipt);

    BizPaymentRequest createPaymentRequest(Long id);

    BizPurchaseRequest createFromSuggestion(PurchaseFromSuggestionDTO dto);

    void updatePaymentStatus(Long paymentRequestId, String paymentStatus);
}
