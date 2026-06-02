package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseItem;
import com.cloudflow.oa.domain.BizPurchaseReceipt;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.dto.PurchaseFromSuggestionDTO;
import com.cloudflow.oa.domain.dto.PurchaseReceiptDTO;
import com.cloudflow.oa.event.PurchaseRequestSubmittedEvent;
import com.cloudflow.oa.mapper.BizPurchaseItemMapper;
import com.cloudflow.oa.mapper.BizPurchaseReceiptMapper;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.service.IConsumableService;
import com.cloudflow.oa.service.IOaBudgetService;
import com.cloudflow.oa.service.IPaymentRequestService;
import com.cloudflow.oa.service.IPurchaseRequestService;
import com.cloudflow.oa.service.ISupplierService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.oa.enums.PurchaseRequestStatus;
import com.cloudflow.oa.enums.PurchaseRequestEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private static final String PAYMENT_STATUS_NONE = "NONE";
    private static final String PAYMENT_STATUS_DRAFT = "DRAFT";

    private final BizPurchaseItemMapper purchaseItemMapper;
    private final BizPurchaseReceiptMapper purchaseReceiptMapper;
    private final ISupplierService supplierService;
    private final IConsumableService consumableService;
    private final IPaymentRequestService paymentRequestService;
    private final IOaBudgetService oaBudgetService;
    private final StateMachineRegistry stateMachineRegistry;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    @Override
    public Page<BizPurchaseRequest> queryPage(Integer pageNum, Integer pageSize, String status, Long supplierId, Long userId) {
        return (Page<BizPurchaseRequest>) baseMapper.selectPageByDataScope(
                new Page<>(pageNum, pageSize), status, supplierId, userId, DataScopeUtils.listScope());
    }

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
        purchase.setPaymentStatus(PAYMENT_STATUS_NONE);
        purchase.setDeleted(0);
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
        if (persisted == null || !Integer.valueOf(0).equals(persisted.getDeleted())) {
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
    // M1-5: 防并发冲突
    @DistributedLock(key = "'purchase:' + #id + ':submit'")
    public boolean submitPurchase(Long id) {
        BizPurchaseRequest purchase = getRequestWithItems(id);
        if (purchase == null || !Integer.valueOf(0).equals(purchase.getDeleted())) {
            return false;
        }
        if (!STATUS_DRAFT.equals(purchase.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以提交");
        }
        normalizeAndValidatePurchase(purchase);
        compensateUserSnapshot(purchase);
        reserveBudget(purchase);

        // M1-6: 使用状态机进行状态转换
        StateMachine<PurchaseRequestStatus, PurchaseRequestEvent> stateMachine = stateMachineRegistry.require("PurchaseRequest");
        PurchaseRequestStatus currentStatus = PurchaseRequestStatus.valueOf(purchase.getStatus());
        PurchaseRequestStatus newStatus = stateMachine.fire(currentStatus, PurchaseRequestEvent.SUBMIT);
        purchase.setStatus(newStatus.name());

        boolean updated = updateById(purchase);
        if (updated) {
            PurchaseRequestSubmittedEvent event = new PurchaseRequestSubmittedEvent();
            event.setPurchaseId(purchase.getId());
            event.setPurchaseNo(purchase.getPurchaseNo());
            event.setUserId(purchase.getUserId());
            event.setUserName(purchase.getUserName());
            event.setDeptName(purchase.getDeptName());
            event.setSupplierName(purchase.getSupplierName());
            event.setTotalAmount(purchase.getTotalAmount());
            event.setReason(purchase.getReason());
            event.setItemSummary(buildItemSummary(purchase.getItems()));
            event.setSubmittedAt(LocalDateTime.now());
            publishPurchaseSubmittedEvent(purchase, event);
        }
        return updated;
    }

    @Override
    @Audit(name = "采购分批入库", spel = "#receipt", oldVal = "@purchaseRequestServiceImpl.getRequestWithItems(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean receivePurchase(Long id, PurchaseReceiptDTO receipt) {
        BizPurchaseRequest purchase = getRequestWithItems(id);
        if (purchase == null || !Integer.valueOf(0).equals(purchase.getDeleted())) {
            throw new IllegalArgumentException("采购申请不存在");
        }
        if (!STATUS_APPROVED.equals(purchase.getStatus()) && !STATUS_PARTIAL_RECEIVED.equals(purchase.getStatus())) {
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

        // M1-6: 使用状态机进行状态转换
        StateMachine<PurchaseRequestStatus, PurchaseRequestEvent> stateMachine = stateMachineRegistry.require("PurchaseRequest");
        PurchaseRequestStatus currentStatus = PurchaseRequestStatus.valueOf(purchase.getStatus());
        boolean fullyReceived = isFullyReceived(purchase.getItems());
        PurchaseRequestEvent event = fullyReceived ? PurchaseRequestEvent.FULL_RECEIVE : PurchaseRequestEvent.PARTIAL_RECEIVE;
        PurchaseRequestStatus newStatus = stateMachine.fire(currentStatus, event);
        purchase.setStatus(newStatus.name());

        purchase.setUpdateBy(UserContext.getUserName());
        purchase.setUpdateTime(now);
        return updateById(purchase);
    }

    @Override
    @Audit(name = "采购生成付款申请", spel = "#id", oldVal = "@purchaseRequestServiceImpl.getRequestWithItems(#id)", diff = true, highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public BizPaymentRequest createPaymentRequest(Long id) {
        BizPurchaseRequest purchase = getRequestWithItems(id);
        if (purchase == null || !Integer.valueOf(0).equals(purchase.getDeleted())) {
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
        purchase.setPaymentStatus(PAYMENT_STATUS_DRAFT);
        purchase.setUpdateBy(UserContext.getUserName());
        purchase.setUpdateTime(now);
        updateById(purchase);
        return payment;
    }

    @Override
    @Audit(name = "补货建议生成采购草稿", spel = "#dto")
    @Transactional(rollbackFor = Exception.class)
    public BizPurchaseRequest createFromSuggestion(PurchaseFromSuggestionDTO dto) {
        if (dto == null || dto.getItems() == null || dto.getItems().isEmpty()) {
            throw new IllegalArgumentException("补货明细不能为空");
        }
        BizPurchaseRequest purchase = new BizPurchaseRequest();
        purchase.setSupplierId(resolveSuggestionSupplierId(dto));
        purchase.setExpectedDate(dto.getExpectedDate());
        purchase.setReason(StringUtils.hasText(dto.getReason()) ? dto.getReason() : "低库存补货采购");
        List<BizPurchaseItem> items = new ArrayList<>();
        for (PurchaseFromSuggestionDTO.Item source : dto.getItems()) {
            if (source == null || source.getConsumableId() == null || source.getQuantity() == null || source.getQuantity() <= 0) {
                continue;
            }
            BizPurchaseItem item = new BizPurchaseItem();
            item.setConsumableId(source.getConsumableId());
            item.setQuantity(source.getQuantity());
            item.setUnitPrice(BigDecimal.ZERO);
            items.add(item);
        }
        if (items.isEmpty()) {
            throw new IllegalArgumentException("有效补货明细不能为空");
        }
        purchase.setItems(items);
        if (!createPurchase(purchase)) {
            throw new IllegalStateException("创建采购草稿失败");
        }
        return getRequestWithItems(purchase.getId());
    }

    @Override
    @Audit(name = "更新付款状态", diff = true, highRisk = true)
    public void updatePaymentStatus(Long paymentRequestId, String paymentStatus) {
        if (paymentRequestId == null || !StringUtils.hasText(paymentStatus)) {
            return;
        }
        LambdaUpdateWrapper<BizPurchaseRequest> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizPurchaseRequest::getPaymentRequestId, paymentRequestId)
                .eq(BizPurchaseRequest::getDeleted, "0")
                .set(BizPurchaseRequest::getPaymentStatus, paymentStatus)
                .set(BizPurchaseRequest::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(BizPurchaseRequest::getUpdateTime, LocalDateTime.now());
        update(wrapper);
    }

    @Override
    public void releaseBudgetOnRejected(Long purchaseId) {
        BizPurchaseRequest purchase = getRequestWithItems(purchaseId);
        if (purchase == null) {
            return;
        }
        releaseBudget(purchase);
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
        if (supplier == null || !Integer.valueOf(0).equals(supplier.getDeleted())) {
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

    private Long resolveSuggestionSupplierId(PurchaseFromSuggestionDTO dto) {
        if (dto.getSupplierId() != null) {
            return dto.getSupplierId();
        }
        Long supplierId = null;
        for (PurchaseFromSuggestionDTO.Item item : dto.getItems()) {
            if (item == null || item.getConsumableId() == null) {
                continue;
            }
            SysConsumable consumable = consumableService.getById(item.getConsumableId());
            if (consumable == null || consumable.getDefaultSupplierId() == null) {
                continue;
            }
            if (supplierId == null) {
                supplierId = consumable.getDefaultSupplierId();
                continue;
            }
            if (!supplierId.equals(consumable.getDefaultSupplierId())) {
                throw new IllegalArgumentException("多条补货建议存在不同默认供应商，请手动选择供应商");
            }
        }
        if (supplierId == null) {
            throw new IllegalArgumentException("请选择供应商");
        }
        return supplierId;
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

    private void publishPurchaseSubmittedEvent(BizPurchaseRequest purchase, PurchaseRequestSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("PURCHASE_REQUEST_SUBMITTED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(purchase.getId())
                    .tenantId(purchase.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            log.warn("采购申请提交事件发布失败, purchaseId={}, error={}", purchase.getId(), e.getMessage());
        }
    }

    private void reserveBudget(BizPurchaseRequest purchase) {
        if (purchase.getItems() == null || purchase.getItems().isEmpty()) {
            oaBudgetService.reserveBudget(
                    OaBusinessTypes.PURCHASE_REQUEST,
                    purchase.getId(),
                    purchase.getPurchaseNo(),
                    purchase.getDeptId(),
                    purchase.getDeptName(),
                    purchase.getProjectId(),
                    purchase.getProjectName(),
                    purchase.getBudgetSubjectCode(),
                    purchase.getBudgetSubjectName(),
                    purchase.getTotalAmount(),
                    "采购提交占用预算"
            );
            return;
        }
        for (BizPurchaseItem item : purchase.getItems()) {
            oaBudgetService.reserveBudget(
                    OaBusinessTypes.PURCHASE_REQUEST,
                    purchase.getId(),
                    purchase.getPurchaseNo(),
                    purchase.getDeptId(),
                    purchase.getDeptName(),
                    purchase.getProjectId(),
                    purchase.getProjectName(),
                    StringUtils.hasText(item.getBudgetSubjectCode()) ? item.getBudgetSubjectCode() : purchase.getBudgetSubjectCode(),
                    StringUtils.hasText(item.getBudgetSubjectName()) ? item.getBudgetSubjectName() : purchase.getBudgetSubjectName(),
                    item.getAmount(),
                    "采购明细占用预算"
            );
        }
    }

    private void releaseBudget(BizPurchaseRequest purchase) {
        if (purchase.getItems() == null || purchase.getItems().isEmpty()) {
            oaBudgetService.releaseBudget(
                    OaBusinessTypes.PURCHASE_REQUEST,
                    purchase.getId(),
                    purchase.getPurchaseNo(),
                    purchase.getDeptId(),
                    purchase.getDeptName(),
                    purchase.getProjectId(),
                    purchase.getProjectName(),
                    purchase.getBudgetSubjectCode(),
                    purchase.getBudgetSubjectName(),
                    purchase.getTotalAmount(),
                    "采购驳回释放预算"
            );
            return;
        }
        for (BizPurchaseItem item : purchase.getItems()) {
            oaBudgetService.releaseBudget(
                    OaBusinessTypes.PURCHASE_REQUEST,
                    purchase.getId(),
                    purchase.getPurchaseNo(),
                    purchase.getDeptId(),
                    purchase.getDeptName(),
                    purchase.getProjectId(),
                    purchase.getProjectName(),
                    StringUtils.hasText(item.getBudgetSubjectCode()) ? item.getBudgetSubjectCode() : purchase.getBudgetSubjectCode(),
                    StringUtils.hasText(item.getBudgetSubjectName()) ? item.getBudgetSubjectName() : purchase.getBudgetSubjectName(),
                    item.getAmount(),
                    "采购明细释放预算"
            );
        }
    }
}
