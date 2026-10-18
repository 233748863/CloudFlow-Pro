package com.cloudflow.oa.service;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.OaHrPaymentMapper;
import com.cloudflow.oa.mapper.OaHrPaymentMapper.AdvanceSource;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OaHrPaymentService {
    public static final String PAID_EVENT = "HR_ADVANCE_PAYMENT_PAID";
    private final OaHrPaymentMapper sources;
    private final BizPaymentRequestMapper payments;
    private final OutboxPublisher publisher;
    private final ObjectMapper json;
    private final OaSettlementPaymentService settlementPayments;

    @Transactional(rollbackFor = Exception.class)
    public Long create(String sourceType, Long sourceId) {
        if ("HR_SETTLEMENT".equals(sourceType)) return settlementPayments.create(sourceId);
        if (!"HR_ADVANCE".equals(sourceType)) throw new IllegalArgumentException("人事付款来源类型尚未接通");
        AdvanceSource source = source(sourceId);
        BizPaymentRequest existing = sources.sourcePayment(tenant(), sourceId.toString());
        if (existing != null) { matches(existing, source); return existing.getId(); }
        requireFundable(source);
        if (!"APPROVED".equals(source.status()) || !"APPROVED".equals(source.approvalStatus()) || source.paymentRequestId() != null
                || sources.approved(tenant(), sourceId, source.instanceId()) != 1) throw new IllegalArgumentException("借款尚无真实审批通过依据");
        PaymentSourceGuard.amount(source.amount());
        LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Shanghai")).withNano(0);
        BizPaymentRequest payment = new BizPaymentRequest();
        payment.setTenantId(tenant()); payment.setSourceBizType("HR_ADVANCE"); payment.setSourceBizId(sourceId.toString());
        payment.setPaymentNo("HRAD" + sourceId); payment.setUserId(source.userId()); payment.setUserName(source.userName());
        payment.setPayeeName(source.employeeName()); payment.setDeptId(source.deptId()); payment.setDeptName(source.deptName());
        payment.setAmount(source.amount()); payment.setPaymentType("OTHER"); payment.setReason("员工借款：" + source.advanceNo());
        payment.setStatus("APPROVED"); payment.setDeleted(0); payment.setVersion(0); payment.setInvoiceStatus("NONE");
        payment.setCreateBy("hr-source"); payment.setUpdateBy("hr-source"); payment.setCreateTime(now); payment.setUpdateTime(now);
        if (payments.insert(payment) != 1) throw new IllegalStateException("借款付款单未保存");
        return payment.getId();
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean confirmPaid(Long paymentId) {
        BizPaymentRequest initial = payments.selectById(paymentId);
        if (initial != null && "HR_SETTLEMENT".equals(initial.getSourceBizType())) return settlementPayments.confirmPaid(paymentId);
        if (initial == null || !Objects.equals(initial.getTenantId(), tenant()) || !"HR_ADVANCE".equals(initial.getSourceBizType())) throw new IllegalArgumentException("借款付款来源不存在");
        Long advanceId;
        try { advanceId = Long.valueOf(initial.getSourceBizId()); } catch (RuntimeException failure) { throw new IllegalArgumentException("借款付款来源无效"); }
        AdvanceSource source = source(advanceId);
        BizPaymentRequest payment = sources.lockPayment(tenant(), paymentId); matches(payment, source);
        Long user = UserContext.getUserId();
        if (user == null || user.equals(source.userId()) || !StpUtil.hasPermission("oa:payment:pay")
                || sources.payableBy(tenant(), user, source.deptId()) != 1) throw new ServiceException("须由有该员工范围的独立财务确认付款", 403);
        if (!Objects.equals(source.paymentRequestId(), paymentId)) throw new ServiceException("等待借款绑定唯一付款单后再确认付款", 409);
        if ("PAID".equals(payment.getStatus())) return true;
        requireFundable(source);
        if (!"APPROVED".equals(payment.getStatus()) || !"APPROVED".equals(source.status()) || !"APPROVED".equals(source.approvalStatus())
                || sources.approved(tenant(), advanceId, source.instanceId()) != 1) throw new ServiceException("借款及付款单须已完成审批", 409);
        LocalDateTime paidTime = LocalDateTime.now(ZoneId.of("Asia/Shanghai")).withNano(0);
        payment.setStatus("PAID"); payment.setUpdateBy(UserContext.getUserName()); payment.setUpdateTime(paidTime);
        if (payments.updateById(payment) != 1) throw new IllegalStateException("付款状态已变化，请核对原付款单");
        String eventId = UUID.nameUUIDFromBytes((tenant() + ":" + PAID_EVENT + ":" + paymentId).getBytes(StandardCharsets.UTF_8)).toString();
        try {
            publisher.publish(BusinessEventEnvelope.builder().eventId(eventId).eventType(PAID_EVENT).sourceModule("cloudflow-oa")
                    .sourceId(paymentId).tenantId(tenant()).occurredAt(paidTime).payload(json.writeValueAsString(Map.of(
                        "tenantId", tenant().toString(), "advanceId", advanceId.toString(), "paymentId", paymentId.toString(),
                        "amount", payment.getAmount().toPlainString(), "paidTime", paidTime.format(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME), "eventId", eventId))).build());
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw new IllegalStateException("放款通知未保存，付款确认已撤回", failure); }
        return true;
    }

    private AdvanceSource source(Long advanceId) {
        if (advanceId == null || advanceId <= 0) throw new IllegalArgumentException("借款来源编号无效");
        Long employeeId = sources.advanceEmployee(tenant(), advanceId);
        if (employeeId == null || sources.lockEmployee(tenant(), employeeId) == null) throw new IllegalArgumentException("借款员工不存在");
        AdvanceSource source = sources.lockAdvance(tenant(), advanceId);
        if (source == null || !employeeId.equals(source.employeeId())) throw new IllegalArgumentException("借款员工归属已变化");
        return source;
    }

    private void matches(BizPaymentRequest payment, AdvanceSource source) {
        if (payment == null || !Objects.equals(payment.getTenantId(), tenant()) || !Integer.valueOf(0).equals(payment.getDeleted())
                || !"HR_ADVANCE".equals(payment.getSourceBizType()) || !source.advanceId().toString().equals(payment.getSourceBizId())
                || !Objects.equals(source.userId(), payment.getUserId()) || payment.getAmount() == null || source.amount().compareTo(payment.getAmount()) != 0
                || !Objects.equals(source.employeeName(), payment.getPayeeName())) throw new IllegalArgumentException("借款与付款来源内容不一致");
    }

    private void requireFundable(AdvanceSource source) {
        if (sources.fundable(tenant(), source.employeeId()) != 1) {
            throw new ServiceException("员工须仍在职、账号关联有效且未进入离职结算，才能实际放款", 409);
        }
    }

    private Long tenant() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0) throw new IllegalArgumentException("缺少可信租户");
        return tenantId;
    }
}
