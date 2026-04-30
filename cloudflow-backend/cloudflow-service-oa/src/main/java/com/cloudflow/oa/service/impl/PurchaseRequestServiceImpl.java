package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseItem;
import com.cloudflow.oa.domain.BizPurchaseReceipt;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.dto.PurchaseReceiptDTO;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.mapper.BizPurchaseItemMapper;
import com.cloudflow.oa.mapper.BizPurchaseReceiptMapper;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.service.IConsumableService;
import com.cloudflow.oa.service.IPaymentRequestService;
import com.cloudflow.oa.service.IPurchaseRequestService;
import com.cloudflow.oa.service.ISupplierService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 行政采购申请 Service 实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PurchaseRequestServiceImpl extends ServiceImpl<BizPurchaseRequestMapper, BizPurchaseRequest>
        implements IPurchaseRequestService {

    private static final String STATUS_DRAFT = "DRAFT";
    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_APPROVED = "APPROVED";
    private static final String STATUS_PARTIAL_RECEIVED = "PARTIAL_RECEIVED";
    private static final String STATUS_RECEIVED = "RECEIVED";
    private static final String STATUS_PAYMENT_CREATED = "PAYMENT_CREATED";

    private final BizPurchaseItemMapper purchaseItemMapper;
    private final BizPurchaseReceiptMapper purchaseReceiptMapper;
    private final ISupplierService supplierService;
    private final IConsumableService consumableService;
    private final IPaymentRequestService paymentRequestService;
    private final RemoteWorkflowService remoteWorkflowService;

    @Override
    public BizPurchaseRequest getRequestWithItems(Long id) {
        return baseMapper.selectRequestWithItems(id);
    }

    @Override
    public String generatePurchaseNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("CG%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "创建采购申请", spel = "#purchase")
    @Transactional(rollbackFor = Exception.class)
    public boolean createPurchase(BizPurchaseRequest purchase) {
        normalizeAndValidatePurchase(purchase);
        fillSupplierSnapshot(purchase);
        fillUserSnapshot(purchase);
        LocalDateTime now = LocalDateTime.now();
        purchase.setPurchaseNo(generatePurchaseNo());
        purchase.setStatus(STATUS_DRAFT);
        purchase.setDelFlag("0");
        purchase.setCreateBy(UserContext.getUserName());
        purchase.setCreateTime(now);
        purchase.setUpdateBy(UserContext.getUserName());
        purchase.setUpdateTime(now);
        boolean saved = save(purchase);
        if (saved) {
            insertItems(purchase);
        }
        return saved;
    }

    @Override
    @Audit(name = "更新采购申请", spel = "#purchase", oldVal = "@purchaseRequestServiceImpl.getRequestWithItems(#purchase.id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean updatePurchase(BizPurchaseRequest purchase) {
        if (purchase == null || purchase.getId() == null) {
            throw new IllegalArgumentException("采购申请ID不能为空");
        }
        BizPurchaseRequest persisted = getById(purchase.getId());
        if (persisted == null || !"0".equals(persisted.getDelFlag())) {
            throw new IllegalArgumentException("采购申请不存在");
        }
        if (!STATUS_DRAFT.equals(persisted.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以编辑");
        }
        normalizeAndValidatePurchase(purchase);
        fillSupplierSnapshot(purchase);
        purchase.setStatus(STATUS_DRAFT);
        purchase.setUpdateBy(UserContext.getUserName());
        purchase.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(purchase);
        if (updated) {
            LambdaQueryWrapper<BizPurchaseItem> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(BizPurchaseItem::getPurchaseId, purchase.getId());
            purchaseItemMapper.delete(wrapper);
            insertItems(purchase);
        }
        return updated;
    }

    @Override
    @Audit(name = "提交采购申请", spel = "#id", oldVal = "@purchaseRequestServiceImpl.getRequestWithItems(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean submitPurchase(Long id) {
        BizPurchaseRequest purchase = getRequestWithItems(id);
        if (purchase == null || !"0".equals(purchase.getDelFlag())) {
            return false;
        }
        if (!STATUS_DRAFT.equals(purchase.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以提交");
        }
        normalizeAndValidatePurchase(purchase);
        compensateUserSnapshot(purchase);
        purchase.setStatus(STATUS_PENDING);

        try {
            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setProcessDefKey("purchase_request");
            req.setBusinessKey("PURCHASE_REQUEST:" + purchase.getId());
            Map<String, Object> variables = new HashMap<>();
            variables.put("purchaseId", purchase.getId());
            variables.put("purchaseNo", purchase.getPurchaseNo());
            variables.put("amount", purchase.getTotalAmount());
            variables.put("totalAmount", purchase.getTotalAmount());
            variables.put("supplierName", purchase.getSupplierName());
            variables.put("userId", purchase.getUserId());
            variables.put("userName", purchase.getUserName());
            variables.put("deptName", purchase.getDeptName());
            variables.put("reason", purchase.getReason());
            variables.put("itemSummary", buildItemSummary(purchase.getItems()));
            WorkflowCallbackStreamConstants.applyCallbackMetadata(
                    variables,
                    WorkflowCallbackStreamConstants.BUSINESS_TYPE_PURCHASE_REQUEST,
                    purchase.getId(),
                    purchase.getPurchaseNo()
            );
            req.setVariables(variables);

            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    purchase.setInstanceId(instanceId);
                }
                log.info("采购申请 {} 工作流启动成功，流程实例ID: {}", purchase.getPurchaseNo(), instanceId);
            } else {
                log.warn("采购申请 {} 工作流启动返回异常: {}", purchase.getPurchaseNo(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            log.error("采购申请 {} 启动工作流失败，但提交状态已更新", purchase.getPurchaseNo(), e);
        }

        return updateById(purchase);
    }

    @Override
    @Audit(name = "采购分批入库", spel = "#receipt", oldVal = "@purchaseRequestServiceImpl.getRequestWithItems(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean receivePurchase(Long id, PurchaseReceiptDTO receipt) {
        BizPurchaseRequest purchase = getRequestWithItems(id);
        if (purchase == null || !"0".equals(purchase.getDelFlag())) {
            throw new IllegalArgumentException("采购申请不存在");
        }
        if (!STATUS_APPROVED.equals(purchase.getStatus()) && !STATUS_PARTIAL_RECEIVED.equals(purchase.getStatus())
                && !STATUS_PAYMENT_CREATED.equals(purchase.getStatus())) {
            throw new IllegalArgumentException("只有已通过或部分入库的采购申请可以入库");
        }
        if (receipt == null || receipt.getItems() == null || receipt.getItems().isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        Map<Long, BizPurchaseItem> itemMap = new HashMap<>();
        for (BizPurchaseItem item : purchase.getItems()) {
            itemMap.put(item.getId(), item);
        }

        LocalDateTime now = LocalDateTime.now();
        for (PurchaseReceiptDTO.PurchaseReceiptItemDTO receiptItem : receipt.getItems()) {
            if (receiptItem == null || receiptItem.getItemId() == null || receiptItem.getQuantity() == null
                    || receiptItem.getQuantity() <= 0) {
                throw new IllegalArgumentException("入库数量必须大于0");
            }
            BizPurchaseItem item = itemMap.get(receiptItem.getItemId());
            if (item == null) {
                throw new IllegalArgumentException("采购明细不存在，itemId=" + receiptItem.getItemId());
            }
            int requested = defaultInt(item.getQuantity());
            int received = defaultInt(item.getReceivedQuantity());
            int nextReceived = received + receiptItem.getQuantity();
            if (nextReceived > requested) {
                throw new IllegalArgumentException("入库数量不能超过申请数量：" + item.getConsumableName());
            }
            String stockRemark = "采购入库：" + purchase.getPurchaseNo()
                    + (StringUtils.hasText(receipt.getRemark()) ? "，" + receipt.getRemark() : "");
            if (!consumableService.addStock(item.getConsumableId(), receiptItem.getQuantity(), stockRemark)) {
                throw new IllegalArgumentException("耗材入库失败：" + item.getConsumableName());
            }

            LambdaUpdateWrapper<BizPurchaseItem> itemUpdate = new LambdaUpdateWrapper<>();
            itemUpdate.eq(BizPurchaseItem::getId, item.getId())
                    .set(BizPurchaseItem::getReceivedQuantity, nextReceived);
            purchaseItemMapper.update(null, itemUpdate);
            item.setReceivedQuantity(nextReceived);

            BizPurchaseReceipt record = new BizPurchaseReceipt();
            record.setTenantId(UserContext.getTenantId());
            record.setPurchaseId(purchase.getId());
            record.setItemId(item.getId());
            record.setConsumableId(item.getConsumableId());
            record.setConsumableName(item.getConsumableName());
            record.setReceivedQuantity(receiptItem.getQuantity());
            record.setOperatorId(UserContext.getUserId());
            record.setOperatorName(UserContext.getUserName());
            record.setReceiptTime(now);
            record.setRemark(receipt.getRemark());
            record.setCreateBy(UserContext.getUserName());
            record.setCreateTime(now);
            purchaseReceiptMapper.insert(record);
        }

        purchase.setStatus(isFullyReceived(purchase.getItems()) ? STATUS_RECEIVED : STATUS_PARTIAL_RECEIVED);
        purchase.setUpdateBy(UserContext.getUserName());
        purchase.setUpdateTime(now);
        return updateById(purchase);
    }

    @Override
    @Audit(name = "采购生成付款申请", spel = "#id", oldVal = "@purchaseRequestServiceImpl.getRequestWithItems(#id)")
    @Transactional(rollbackFor = Exception.class)
    public BizPaymentRequest createPaymentRequest(Long id) {
        BizPurchaseRequest purchase = getRequestWithItems(id);
        if (purchase == null || !"0".equals(purchase.getDelFlag())) {
            throw new IllegalArgumentException("采购申请不存在");
        }
        if (!STATUS_APPROVED.equals(purchase.getStatus()) && !STATUS_PARTIAL_RECEIVED.equals(purchase.getStatus())
                && !STATUS_RECEIVED.equals(purchase.getStatus())) {
            throw new IllegalArgumentException("只有审批通过后的采购申请可以生成付款申请");
        }
        if (purchase.getPaymentRequestId() != null) {
            BizPaymentRequest existing = paymentRequestService.getById(purchase.getPaymentRequestId());
            if (existing != null) {
                return existing;
            }
        }

        BizPaymentRequest payment = new BizPaymentRequest();
        payment.setTenantId(purchase.getTenantId());
        payment.setUserId(UserContext.getUserId());
        payment.setUserName(UserContext.getUserName());
        payment.setDeptId(UserContext.getDeptId());
        payment.setDeptName(UserContext.getDeptName());
        payment.setPaymentNo(paymentRequestService.generatePaymentNo());
        payment.setPayeeName(purchase.getSupplierName());
        payment.setPayeeAccount(purchase.getSupplierAccount());
        payment.setPayeeBank(purchase.getSupplierBank());
        payment.setAmount(purchase.getTotalAmount());
        payment.setPaymentType("PURCHASE");
        payment.setReason("采购申请 " + purchase.getPurchaseNo() + " 付款：" + purchase.getReason());
        payment.setExpectedDate(purchase.getExpectedDate());
        payment.setAttachmentUrl(purchase.getAttachmentUrl());
        payment.setStatus(STATUS_DRAFT);
        LocalDateTime now = LocalDateTime.now();
        payment.setCreateBy(UserContext.getUserName());
        payment.setCreateTime(now);
        payment.setUpdateBy(UserContext.getUserName());
        payment.setUpdateTime(now);
        if (!paymentRequestService.createPayment(payment)) {
            throw new IllegalStateException("创建付款申请失败");
        }

        purchase.setPaymentRequestId(payment.getId());
        purchase.setStatus(STATUS_PAYMENT_CREATED);
        purchase.setUpdateBy(UserContext.getUserName());
        purchase.setUpdateTime(now);
        updateById(purchase);
        return payment;
    }

    private void normalizeAndValidatePurchase(BizPurchaseRequest purchase) {
        if (purchase == null) {
            throw new IllegalArgumentException("采购申请不能为空");
        }
        if (purchase.getSupplierId() == null) {
            throw new IllegalArgumentException("请选择供应商");
        }
        if (!StringUtils.hasText(purchase.getReason())) {
            throw new IllegalArgumentException("采购事由不能为空");
        }
        if (purchase.getItems() == null || purchase.getItems().isEmpty()) {
            throw new IllegalArgumentException("采购明细不能为空");
        }
        purchase.setAttachmentUrl(
                OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(purchase.getAttachmentUrl(), "采购申请附件")
        );

        BigDecimal total = BigDecimal.ZERO;
        for (BizPurchaseItem item : purchase.getItems()) {
            validateAndFillItem(item);
            total = total.add(item.getAmount());
        }
        purchase.setTotalAmount(total);
    }

    private void validateAndFillItem(BizPurchaseItem item) {
        if (item == null || item.getConsumableId() == null) {
            throw new IllegalArgumentException("请选择采购耗材");
        }
        if (item.getQuantity() == null || item.getQuantity() <= 0) {
            throw new IllegalArgumentException("采购数量必须大于0");
        }
        if (item.getUnitPrice() == null || item.getUnitPrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("采购单价不能小于0");
        }
        SysConsumable consumable = consumableService.getById(item.getConsumableId());
        if (consumable == null) {
            throw new IllegalArgumentException("耗材不存在，consumableId=" + item.getConsumableId());
        }
        item.setConsumableName(consumable.getName());
        item.setModel(consumable.getModel());
        item.setUnit(consumable.getUnit());
        item.setAmount(item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity())));
        item.setReceivedQuantity(item.getReceivedQuantity() == null ? 0 : Math.max(0, item.getReceivedQuantity()));
    }

    private void fillSupplierSnapshot(BizPurchaseRequest purchase) {
        SysSupplier supplier = supplierService.getById(purchase.getSupplierId());
        if (supplier == null || !"0".equals(supplier.getDelFlag())) {
            throw new IllegalArgumentException("供应商不存在");
        }
        if (!"ACTIVE".equals(supplier.getStatus())) {
            throw new IllegalArgumentException("供应商已停用");
        }
        purchase.setSupplierName(supplier.getSupplierName());
        purchase.setSupplierContact(supplier.getContactName());
        purchase.setSupplierPhone(supplier.getContactPhone());
        purchase.setSupplierBank(supplier.getBankName());
        purchase.setSupplierAccount(supplier.getBankAccount());
    }

    private void fillUserSnapshot(BizPurchaseRequest purchase) {
        purchase.setTenantId(UserContext.getTenantId());
        purchase.setUserId(UserContext.getUserId());
        purchase.setUserName(UserContext.getUserName());
        purchase.setDeptId(UserContext.getDeptId());
        purchase.setDeptName(UserContext.getDeptName());
    }

    private void compensateUserSnapshot(BizPurchaseRequest purchase) {
        if (purchase.getTenantId() == null) {
            purchase.setTenantId(UserContext.getTenantId());
        }
        if (purchase.getUserId() == null) {
            purchase.setUserId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(purchase.getUserName())) {
            purchase.setUserName(UserContext.getUserName());
        }
        if (purchase.getDeptId() == null) {
            purchase.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(purchase.getDeptName())) {
            purchase.setDeptName(UserContext.getDeptName());
        }
    }

    private void insertItems(BizPurchaseRequest purchase) {
        for (BizPurchaseItem item : purchase.getItems()) {
            item.setTenantId(purchase.getTenantId());
            item.setPurchaseId(purchase.getId());
            item.setId(null);
            item.setReceivedQuantity(0);
            purchaseItemMapper.insert(item);
        }
    }

    private String buildItemSummary(List<BizPurchaseItem> items) {
        if (items == null || items.isEmpty()) {
            return "";
        }
        List<String> summaries = new ArrayList<>();
        for (BizPurchaseItem item : items) {
            summaries.add(item.getConsumableName() + " x " + item.getQuantity() + Objects.toString(item.getUnit(), ""));
        }
        return String.join("，", summaries);
    }

    private boolean isFullyReceived(List<BizPurchaseItem> items) {
        if (items == null || items.isEmpty()) {
            return false;
        }
        for (BizPurchaseItem item : items) {
            if (defaultInt(item.getReceivedQuantity()) < defaultInt(item.getQuantity())) {
                return false;
            }
        }
        return true;
    }

    private int defaultInt(Integer value) {
        return value == null ? 0 : value;
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> dataMap = (Map<String, Object>) data;
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        if (data instanceof String) {
            return (String) data;
        }
        return null;
    }
}
