package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.event.PaymentRequestSubmittedEvent;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.service.IOaBudgetService;
import com.cloudflow.oa.service.IPaymentRequestService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 浠樻鐢宠Service瀹炵幇绫? */
@Slf4j
@Service
public class PaymentRequestServiceImpl extends ServiceImpl<BizPaymentRequestMapper, BizPaymentRequest> 
        implements IPaymentRequestService {

    @Autowired
    private BizPurchaseRequestMapper purchaseRequestMapper;

    @Autowired
    private IOaBudgetService oaBudgetService;

    @Autowired
    private OutboxPublisher outboxPublisher;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    public Page<BizPaymentRequest> queryPage(Integer pageNum, Integer pageSize, String status, String paymentType, Long userId) {
        return (Page<BizPaymentRequest>) baseMapper.selectPageByDataScope(
                new Page<>(pageNum, pageSize), status, paymentType, userId, DataScopeUtils.listScope());
    }

    @Override
    public List<BizPaymentRequest> listForExport(String status, String paymentType, Long userId) {
        return baseMapper.selectListByDataScope(status, paymentType, userId, DataScopeUtils.listScope());
    }

    @Override
    public String generatePaymentNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("FK%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "鍒涘缓浠樻鐢宠", spel = "#payment", diff = true, highRisk = true)
    public boolean createPayment(BizPaymentRequest payment) {
        normalizePaymentAttachment(payment);
        return save(payment);
    }

    @Override
    @Audit(name = "鏇存柊浠樻鐢宠", spel = "#payment", oldVal = "@paymentRequestServiceImpl.getById(#payment.id)", diff = true, highRisk = true)
    public boolean updatePayment(BizPaymentRequest payment) {
        normalizePaymentAttachment(payment);
        return updateById(payment);
    }

    @Override
    @Audit(name = "鎻愪氦浠樻鐢宠", spel = "#id", oldVal = "@paymentRequestServiceImpl.getById(#id)", diff = true, highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 闃插苟鍙戝啿绐?    @DistributedLock(key = "'payment:' + #id + ':submit'")
    public boolean submitPayment(Long id) {
        BizPaymentRequest payment = getById(id);
        if (payment == null) {
            return false;
        }
        normalizePaymentAttachment(payment);
        
        // 琛ュ伩閫昏緫锛氬巻鍙叉暟鎹彲鑳界己灏戠敤鎴蜂俊鎭紝浠庡綋鍓嶇櫥褰曚笂涓嬫枃琛ュ厖
        if (!StringUtils.hasText(payment.getDeptName())) {
            payment.setDeptName(UserContext.getDeptName());
        }
        if (payment.getDeptId() == null) {
            payment.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(payment.getUserName())) {
            payment.setUserName(UserContext.getUserName());
        }
        if (payment.getUserId() == null) {
            payment.setUserId(UserContext.getUserId());
        }
        reserveBudget(payment);
        
        // update status before workflow start
        payment.setStatus("PENDING");
        updatePurchasePaymentStatus(payment.getId(), "PENDING");
        boolean updated = updateById(payment);
        if (updated) {
            PaymentRequestSubmittedEvent event = new PaymentRequestSubmittedEvent();
            event.setPaymentId(payment.getId());
            event.setPaymentNo(payment.getPaymentNo());
            event.setUserId(payment.getUserId());
            event.setUserName(payment.getUserName());
            event.setDeptName(payment.getDeptName());
            event.setAmount(payment.getAmount());
            event.setPaymentType(payment.getPaymentType());
            event.setPayeeName(payment.getPayeeName());
            event.setPayeeAccount(payment.getPayeeAccount());
            event.setPayeeBank(payment.getPayeeBank());
            event.setReason(payment.getReason());
            event.setSubmittedAt(LocalDateTime.now());
            publishPaymentSubmittedEvent(payment, event);
        }
        return updated;
    }

    @Override
    @Audit(name = "纭浠樻", spel = "#id", oldVal = "@paymentRequestServiceImpl.getById(#id)", diff = true, highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 闃插苟鍙戝啿绐?    @DistributedLock(key = "'payment:' + #id + ':confirm'", waitMs = 500, leaseMs = 15000)
    public boolean confirmPaid(Long id) {
        BizPaymentRequest payment = getById(id);
        if (payment == null || !Integer.valueOf(0).equals(payment.getDeleted())) {
            throw new IllegalArgumentException("payment request does not exist");
        }
        if (!"APPROVED".equals(payment.getStatus())) {
            throw new IllegalArgumentException("payment request must be approved before confirmation");
        }
        payment.setStatus("PAID");
        payment.setUpdateBy(UserContext.getUserName());
        payment.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(payment);
        if (updated) {
            updatePurchasePaymentStatus(id, "PAID");
            oaBudgetService.writeoffBudget(
                    OaBusinessTypes.PAYMENT_REQUEST,
                    payment.getId(),
                    payment.getPaymentNo(),
                    payment.getDeptId(),
                    payment.getDeptName(),
                    payment.getProjectId(),
                    payment.getProjectName(),
                    payment.getBudgetSubjectCode(),
                    payment.getBudgetSubjectName(),
                    payment.getAmount(),
                    "浠樻纭鏍搁攢棰勭畻"
            );
        }
        return updated;
    }

    @Override
    public List<DynamicMapVO> getMonthlyPaymentByDept(String month) {
        return baseMapper.selectMonthlyPaymentByDept(month).stream().map(DynamicMapVO::from).toList();
    }
    
    /**
     * 浠庡伐浣滄祦鍚姩缁撴灉涓彁鍙栨祦绋嬪疄渚婭D
     * 
     * @param data 宸ヤ綔娴佽繑鍥炵殑鏁版嵁
     * @return 娴佺▼瀹炰緥ID锛屾彁鍙栧け璐ヨ繑鍥瀗ull
     */
    private void publishPaymentSubmittedEvent(BizPaymentRequest payment, PaymentRequestSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("PAYMENT_REQUEST_SUBMITTED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(payment.getId())
                    .tenantId(payment.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            log.warn("付款申请提交事件发布失败, paymentId={}, error={}", payment.getId(), e.getMessage());
        }
    }

    private void normalizePaymentAttachment(BizPaymentRequest payment) {
        if (payment == null) {
            throw new IllegalArgumentException("浠樻鐢宠涓嶈兘涓虹┖");
        }
        payment.setAttachmentUrl(
                OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(payment.getAttachmentUrl(), "浠樻鐢宠闄勪欢")
        );
    }

    private void updatePurchasePaymentStatus(Long paymentRequestId, String paymentStatus) {
        if (paymentRequestId == null || !StringUtils.hasText(paymentStatus)) {
            return;
        }
        LambdaUpdateWrapper<BizPurchaseRequest> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizPurchaseRequest::getPaymentRequestId, paymentRequestId)
                .eq(BizPurchaseRequest::getDeleted, "0")
                .set(BizPurchaseRequest::getPaymentStatus, paymentStatus)
                .set(BizPurchaseRequest::getUpdateBy, UserContext.getUserName())
                .set(BizPurchaseRequest::getUpdateTime, LocalDateTime.now());
        purchaseRequestMapper.update(null, wrapper);
    }

    private void reserveBudget(BizPaymentRequest payment) {
        oaBudgetService.reserveBudget(
                OaBusinessTypes.PAYMENT_REQUEST,
                payment.getId(),
                payment.getPaymentNo(),
                payment.getDeptId(),
                payment.getDeptName(),
                payment.getProjectId(),
                payment.getProjectName(),
                payment.getBudgetSubjectCode(),
                payment.getBudgetSubjectName(),
                payment.getAmount(),
                "浠樻鎻愪氦鍗犵敤棰勭畻"
        );
    }
}
