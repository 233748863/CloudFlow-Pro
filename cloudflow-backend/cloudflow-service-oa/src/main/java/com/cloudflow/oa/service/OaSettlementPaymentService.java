package com.cloudflow.oa.service;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.OaHrPaymentMapper;
import com.cloudflow.oa.mapper.OaSettlementPaymentMapper;
import com.cloudflow.oa.mapper.OaSettlementPaymentMapper.Source;
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
public class OaSettlementPaymentService {
    public static final String PAID_EVENT = "HR_SETTLEMENT_PAYMENT_PAID";
    private final OaSettlementPaymentMapper settlements;
    private final OaHrPaymentMapper locks;
    private final BizPaymentRequestMapper payments;
    private final OutboxPublisher publisher;
    private final ObjectMapper json;

    @Transactional(rollbackFor = Exception.class)
    public Long create(Long settlementId) {
        Source source = source(settlementId);
        BizPaymentRequest previous = settlements.payment(tenant(), settlementId.toString());
        if (previous != null) { matches(previous, source); return previous.getId(); }
        if (!"CONFIRMED".equals(source.status()) || !"APPROVED".equals(source.approvalStatus()) || source.paymentRequestId() != null
                || settlements.approved(tenant(), settlementId) != 1) throw new ServiceException("离职结算尚未独立审批并确认", 409);
        PaymentSourceGuard.amount(source.amount());
        if (source.amount().signum() <= 0) throw new IllegalArgumentException("只有正净额离职结算可以建立付款申请");
        LocalDateTime now = now(); BizPaymentRequest payment = new BizPaymentRequest();
        payment.setTenantId(tenant()); payment.setSourceBizType("HR_SETTLEMENT"); payment.setSourceBizId(settlementId.toString());
        payment.setPaymentNo("HRST" + settlementId); payment.setUserId(source.userId()); payment.setUserName(source.userName());
        payment.setPayeeName(source.employeeName()); payment.setDeptId(source.deptId()); payment.setDeptName(source.deptName());
        payment.setAmount(source.amount()); payment.setPaymentType("OTHER"); payment.setReason("离职结算：" + source.settlementNo());
        payment.setStatus("APPROVED"); payment.setDeleted(0); payment.setVersion(0); payment.setInvoiceStatus("NONE");
        payment.setCreateBy("hr-source"); payment.setUpdateBy("hr-source"); payment.setCreateTime(now); payment.setUpdateTime(now);
        if (payments.insert(payment) != 1) throw new IllegalStateException("结算付款申请未保存");
        return payment.getId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "财务确认离职结算实际付款", spel = "#paymentId", highRisk = true)
    public boolean confirmPaid(Long paymentId) {
        BizPaymentRequest initial = payments.selectById(paymentId);
        if (initial == null || !Objects.equals(initial.getTenantId(), tenant()) || !"HR_SETTLEMENT".equals(initial.getSourceBizType())) throw new IllegalArgumentException("结算付款来源不存在");
        Long id;
        try { id = Long.valueOf(initial.getSourceBizId()); } catch (RuntimeException failure) { throw new IllegalArgumentException("结算付款来源无效"); }
        Source source = source(id); BizPaymentRequest payment = locks.lockPayment(tenant(), paymentId); matches(payment, source);
        Long actor = UserContext.getUserId();
        if (actor == null || actor.equals(source.userId())
                || !StpUtil.hasPermission("oa:payment:pay") || locks.payableBy(tenant(), actor, source.deptId()) != 1) throw new ServiceException("须由有该员工范围的独立财务确认付款", 403);
        if (!Objects.equals(source.paymentRequestId(), paymentId)) throw new ServiceException("等待结算绑定唯一付款申请", 409);
        if ("PAID".equals(payment.getStatus())) return true;
        if (!"APPROVED".equals(payment.getStatus()) || !"CONFIRMED".equals(source.status()) || !"APPROVED".equals(source.approvalStatus())
                || settlements.approved(tenant(), id) != 1) throw new ServiceException("结算及付款状态不能确认实际付款", 409);
        LocalDateTime paidTime = now(); payment.setStatus("PAID"); payment.setUpdateBy(UserContext.getUserName()); payment.setUpdateTime(paidTime);
        if (payments.updateById(payment) != 1) throw new ServiceException("付款状态已变化，请读取原单核对", 409);
        String eventId = UUID.nameUUIDFromBytes((tenant() + ":" + PAID_EVENT + ":" + paymentId).getBytes(StandardCharsets.UTF_8)).toString();
        try {
            publisher.publish(BusinessEventEnvelope.builder().eventId(eventId).eventType(PAID_EVENT).sourceModule("cloudflow-oa").sourceId(paymentId)
                    .tenantId(tenant()).occurredAt(paidTime).payload(json.writeValueAsString(Map.of("tenantId", tenant().toString(), "settlementId", id.toString(),
                        "paymentId", paymentId.toString(), "amount", payment.getAmount().toPlainString(), "paidTime", paidTime.format(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME), "eventId", eventId))).build());
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw new IllegalStateException("结算付款通知未保存，本次付款确认已撤回", failure); }
        return true;
    }

    private Source source(Long id) {
        if (id == null || id <= 0) throw new IllegalArgumentException("结算来源编号无效");
        Long employeeId = settlements.employee(tenant(), id);
        if (employeeId == null || locks.lockEmployee(tenant(), employeeId) == null) throw new IllegalArgumentException("结算员工不存在");
        Source source = settlements.lockSource(tenant(), id);
        if (source == null || !employeeId.equals(source.employeeId()) || source.employeeName() == null || source.employeeName().isBlank()) throw new ServiceException("结算确认的收款人或部门依据已变化", 409);
        return source;
    }
    private void matches(BizPaymentRequest payment, Source source) {
        if (payment == null || !Objects.equals(tenant(), payment.getTenantId()) || !Integer.valueOf(0).equals(payment.getDeleted())
                || !"HR_SETTLEMENT".equals(payment.getSourceBizType()) || !source.settlementId().toString().equals(payment.getSourceBizId())
                || !Objects.equals(source.userId(), payment.getUserId()) || !Objects.equals(source.employeeName(), payment.getPayeeName())
                || payment.getAmount() == null || source.amount().compareTo(payment.getAmount()) != 0) throw new ServiceException("结算与原付款申请内容不一致", 409);
    }
    private static LocalDateTime now() { return LocalDateTime.now(ZoneId.of("Asia/Shanghai")).withNano(0); }
    private static Long tenant() { Long tenant = UserContext.getTenantId(); if (tenant == null || tenant <= 0) throw new IllegalArgumentException("缺少可信租户"); return tenant; }
}
