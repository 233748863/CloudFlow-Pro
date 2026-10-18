package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.message.api.MessageChannelReadiness;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.OaPurchaseRfqItem;
import com.cloudflow.oa.domain.OaPurchaseRfqSupplier;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.dto.RfqInviteDTO;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaPurchaseRfqItemMapper;
import com.cloudflow.oa.mapper.OaPurchaseRfqMapper;
import com.cloudflow.oa.mapper.OaPurchaseRfqSupplierMapper;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteMessageDeliveryService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OaRfqInvitationService {
    private final OaPurchaseRfqMapper rfqs;
    private final OaPurchaseRfqSupplierMapper invitations;
    private final OaPurchaseRfqItemMapper items;
    private final SysSupplierMapper suppliers;
    private final OaIdentityReferenceMapper identities;
    private final OaRfqAccessService access;
    private final OaSupplierGovernanceService governance;
    private final OaBusinessRuleService rules;
    private final OaRfqEmailContent content;
    private final MessageSender sender;
    private final RemoteMessageDeliveryService messages;
    private final IOaTraceEventService trace;
    private final OaRfqAuditService audit;

    public record InviteResult(int queued, int registered, int retained) { }

    public MessageChannelReadiness readiness() { return readiness("RFQ_EMAIL_INVITE"); }

    public MessageChannelReadiness readiness(String businessType) {
        try {
            R<MessageChannelReadiness> response = messages.readiness(OaRfqEmailContent.template(businessType));
            if (response != null && response.isSuccess() && response.getData() != null) return response.getData();
        } catch (RuntimeException failure) { }
        return new MessageChannelReadiness(false, "邮件配置暂时无法核验，邮件未发送；可登记电话或线下邀请");
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public InviteResult invite(Long id, RfqInviteDTO request) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(id, OaRecordSupport.tenantId()));
        access.assertOwner(rfq);
        if (request == null || request.version() == null || !Objects.equals(request.version(), rfq.getVersion())) throw new ServiceException("询价已更新，请刷新后重试", 409);
        if (!Set.of("DRAFT", "SENT", "QUOTING").contains(rfq.getStatus()) || rfq.getQuoteDeadline().isBefore(LocalDate.now())) throw new IllegalArgumentException("当前询价不可邀请报价");
        if (request.channel() == null || !Set.of("EMAIL", "PHONE", "OFFLINE").contains(request.channel())) throw new IllegalArgumentException("邀请渠道无效");
        if (request.supplierIds() == null || request.supplierIds().isEmpty() || request.supplierIds().size() > 200
                || request.supplierIds().stream().anyMatch(Objects::isNull)) throw new IllegalArgumentException("请选择1至200家供应商");
        if (!identities.mayInviteRfq(UserContext.getUserId(), rfq.getOwnerId(), OaRecordSupport.tenantId())) throw new ServiceException("当前操作人没有询价邀请权限", 403);
        boolean email = "EMAIL".equals(request.channel());
        if (email) {
            MessageChannelReadiness readiness = readiness();
            if (!readiness.ready()) throw new ServiceException(readiness.reason(), 409);
        }
        List<OaPurchaseRfqSupplier> existing = invitations(id);
        OaRfqAuditService.Snapshot before = audit.snapshot(rfq, Map.of("rfq", rfq, "invitations", existing));
        Set<Long> combined = new HashSet<>(existing.stream().map(OaPurchaseRfqSupplier::getSupplierId).toList());
        combined.addAll(request.supplierIds());
        if (combined.size() > 200) throw new IllegalArgumentException("每轮询价最多邀请200家供应商");
        int queued = 0;
        int registered = 0;
        int retained = 0;
        for (Long supplierId : request.supplierIds().stream().distinct().sorted().toList()) {
            governance.assertSupplierAllowed(supplierId, "RFQ");
            SysSupplier supplier = OaRecordSupport.active(suppliers.selectById(supplierId));
            OaPurchaseRfqSupplier invitation = existing.stream().filter(value -> value.getSupplierId().equals(supplierId)).findFirst().orElse(null);
            if (invitation != null && (reached(invitation) || "QUEUED".equals(invitation.getInviteDeliveryStatus()) || "UNKNOWN".equals(invitation.getInviteDeliveryStatus()))) {
                if (!Objects.equals(request.channel(), invitation.getInviteChannel()) && !reached(invitation)) throw new ServiceException("邮件结果尚未确认，请先核验原投递", 409);
                retained++;
                continue;
            }
            if (email) OaRfqEmailContent.address(supplier.getContactEmail());
            boolean created = invitation == null;
            if (created) { invitation = new OaPurchaseRfqSupplier(); OaRecordSupport.create(invitation, "rfqSupplierId"); }
            invitation.setRfqId(id);
            invitation.setSupplierId(supplierId);
            invitation.setSupplierName(supplier.getSupplierName());
            invitation.setContactName(supplier.getContactName());
            invitation.setContactEmail(supplier.getContactEmail());
            invitation.setContactPhone(supplier.getContactPhone());
            invitation.setInviteTime(LocalDateTime.now());
            invitation.setInviteChannel(request.channel());
            invitation.setInviteDeliveryStatus(email ? "QUEUED" : null);
            invitation.setInviteMessageRecordId(null);
            invitation.setInviteSentTime(null);
            invitation.setQuoteStatus("INVITED");
            OaRecordSupport.touch(invitation);
            if (created) OaRecordSupport.saved(invitations.insert(invitation));
            else OaRecordSupport.saved(invitations.updateById(invitation));
            if (email) {
                sender.send(content.request(rfq, invitation, items(id), "RFQ_EMAIL_INVITE", UserContext.getUserId(), invitation.getVersion()));
                queued++;
            } else registered++;
            trace.record(OaRecordSupport.tenantId(), "RFQ", id, "SUPPLIER", supplierId, email ? "RFQ_EMAIL_QUEUED" : "RFQ_INVITED",
                    email ? "邮件邀请已排队" : "已登记电话或线下邀请", request.channel(), UserContext.getUserId(), OaRecordSupport.userName(), null);
        }
        rules.evaluateWarn("oa.rfq.min.suppliers", "RFQ", id, BigDecimal.valueOf(combined.size()), true, "邀请供应商家数未达到规则中心设置，请核对采购合规要求");
        refreshReached(rfq);
        if (queued > 0 || registered > 0) audit.record(OaRfqAuditService.Action.SUPPLIERS_INVITED, before,
                audit.snapshot(rfq, Map.of("rfq", rfq, "invitations", invitations(id))),
                Map.of("channel", request.channel(), "supplierIds", request.supplierIds().stream().distinct().sorted().toList(),
                        "queued", queued, "registered", registered, "retained", retained), null);
        return new InviteResult(queued, registered, retained);
    }

    public List<OaPurchaseRfqSupplier> invitations(Long rfqId) {
        return invitations.selectList(new LambdaQueryWrapper<OaPurchaseRfqSupplier>().eq(OaPurchaseRfqSupplier::getTenantId, OaRecordSupport.tenantId())
                .eq(OaPurchaseRfqSupplier::getRfqId, rfqId).orderByAsc(OaPurchaseRfqSupplier::getRfqSupplierId));
    }

    public List<OaPurchaseRfqItem> items(Long rfqId) {
        return items.selectList(new LambdaQueryWrapper<OaPurchaseRfqItem>().eq(OaPurchaseRfqItem::getTenantId, OaRecordSupport.tenantId())
                .eq(OaPurchaseRfqItem::getRfqId, rfqId).eq(OaPurchaseRfqItem::getDeleted, 0)
                .orderByAsc(OaPurchaseRfqItem::getSortNo, OaPurchaseRfqItem::getItemId));
    }

    public void assertEditable(Long rfqId) {
        if (invitations(rfqId).stream().anyMatch(value -> "EMAIL".equals(value.getInviteChannel())
                && !"FAILED".equals(value.getInviteDeliveryStatus()))) throw new ServiceException("邮件邀请排队、发送或核验期间不能修改询价内容", 409);
    }

    public static boolean reached(OaPurchaseRfqSupplier invitation) {
        return !"EMAIL".equals(invitation.getInviteChannel()) || invitation.getInviteSentTime() != null;
    }

    public void refreshReached(OaPurchaseRfq rfq) {
        int count = (int) invitations(rfq.getRfqId()).stream().filter(OaRfqInvitationService::reached).count();
        rfq.setInvitedCount(count);
        if (count > 0 && "DRAFT".equals(rfq.getStatus())) rfq.setStatus("SENT");
        OaRecordSupport.touch(rfq);
        OaRecordSupport.saved(rfqs.updateById(rfq));
    }

    public void remind(OaPurchaseRfq rfq) {
        if (!readiness("RFQ_EMAIL_REMINDER").ready()) return;
        for (OaPurchaseRfqSupplier invitation : invitations(rfq.getRfqId())) {
            if ("EMAIL".equals(invitation.getInviteChannel()) && reached(invitation) && "INVITED".equals(invitation.getQuoteStatus())) {
                sender.send(content.request(rfq, invitation, items(rfq.getRfqId()), "RFQ_EMAIL_REMINDER", rfq.getOwnerId(), 0));
            }
        }
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    @Audit(name = "登记逐供应商询价结果邮件", spel = "#id")
    public int notifyAward(Long id, Integer version) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(id, OaRecordSupport.tenantId()));
        access.assertOwner(rfq);
        if (!Objects.equals(version, rfq.getVersion())) throw new ServiceException("询价已更新，请刷新后重试", 409);
        if (!"AWARDED".equals(rfq.getStatus())) throw new IllegalArgumentException("询价尚未完成定标");
        MessageChannelReadiness readiness = readiness("RFQ_EMAIL_AWARD");
        if (!readiness.ready()) throw new ServiceException(readiness.reason(), 409);
        int queued = 0;
        for (OaPurchaseRfqSupplier invitation : invitations(id)) {
            if (reached(invitation) && invitation.getContactEmail() != null && !invitation.getContactEmail().isBlank()) {
                sender.send(content.request(rfq, invitation, List.of(), "RFQ_EMAIL_AWARD", rfq.getOwnerId(), 0));
                queued++;
            }
        }
        return queued;
    }
}
