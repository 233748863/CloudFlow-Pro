package com.cloudflow.crm.service.email;

import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.crm.domain.CrmEmailSuppression;
import com.cloudflow.crm.domain.CrmEmailTrackingLink;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmEmailSuppressionMapper;
import com.cloudflow.crm.mapper.CrmEmailTrackingLinkMapper;
import com.cloudflow.crm.mapper.CrmMassEmailRecipientMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmEmailTrackingService {
    private final CrmMassEmailRecipientMapper recipients;
    private final CrmEmailTrackingLinkMapper links;
    private final CrmEmailSuppressionMapper suppressions;
    private final CrmEmailPolicyService policies;
    private final CrmEmailStatisticsService statistics;
    private final TransactionTemplate transactions;

    public void open(String token, String userAgent, String ip) {
        CrmMassEmailRecipient reference = recipients.selectByOpenToken(CrmEmailSecurity.tokenHash(token));
        if (reference == null) return;
        TenantBroker.runAs(reference.getTenantId(), tenantId -> {
            if (!policies.get(tenantId).trackingEnabled()) return;
            transactions.execute(status -> {
                CrmMassEmailRecipient recipient = recipients.selectForUpdate(tenantId, reference.getRecipientId());
                if (recipient == null || recipient.getFirstOpenTime() != null) return null;
                recipient.setFirstOpenTime(LocalDateTime.now()); CrmRecordSupport.touch(recipient);
                CrmRecordSupport.saved(recipients.updateById(recipient));
                statistics.event(recipient, "OPENED", recipient.getFirstOpenTime(), null, safeObservationText(userAgent), ip); return null;
            });
            refresh(reference);
        });
    }

    public String click(String token, String userAgent, String ip) {
        CrmEmailTrackingLink reference = links.selectByTokenHash(CrmEmailSecurity.tokenHash(token));
        if (reference == null) throw invalid();
        return TenantBroker.applyAs(reference.getTenantId(), tenantId -> {
            CrmEmailPolicyService.Policy policy = policies.get(tenantId);
            if (!policy.trackingEnabled()) throw invalid();
            CrmMassEmailRecipient recipientReference = recipients.selectById(reference.getRecipientId());
            if (recipientReference == null || !Objects.equals(tenantId, recipientReference.getTenantId())) throw invalid();
            String destination = transactions.execute(status -> {
                CrmMassEmailRecipient recipient = recipients.selectForUpdate(tenantId, reference.getRecipientId());
                CrmEmailTrackingLink link = links.selectForUpdate(tenantId, reference.getLinkId());
                if (recipient == null || link == null || !Objects.equals(link.getRecipientId(), recipient.getRecipientId())) throw invalid();
                String target = policy.destination(link.getDestinationUrl());
                if (!MessagePayloadCodec.hash(target).equals(link.getDestinationHash())) throw invalid();
                LocalDateTime now = LocalDateTime.now();
                if (link.getFirstClickTime() == null) { link.setFirstClickTime(now); CrmRecordSupport.saved(links.updateById(link)); }
                if (recipient.getFirstClickTime() == null) {
                    recipient.setFirstClickTime(now); CrmRecordSupport.touch(recipient); CrmRecordSupport.saved(recipients.updateById(recipient));
                    statistics.event(recipient, "CLICKED", now, target, safeObservationText(userAgent), ip);
                }
                return target;
            });
            refresh(recipientReference); return destination;
        });
    }

    public boolean validUnsubscribe(String token) {
        return recipients.selectByUnsubscribeToken(CrmEmailSecurity.tokenHash(token)) != null;
    }

    public void unsubscribe(String token, String reason, String userAgent, String ip) {
        if (reason != null && (reason.length() > 500 || reason.chars().anyMatch(character -> character < 32 && character != '\n' && character != '\r'))) throw invalid();
        CrmMassEmailRecipient reference = recipients.selectByUnsubscribeToken(CrmEmailSecurity.tokenHash(token));
        if (reference == null) throw invalid();
        TenantBroker.runAs(reference.getTenantId(), tenantId -> {
            transactions.execute(status -> {
                CrmMassEmailRecipient recipient = recipients.selectForUpdate(tenantId, reference.getRecipientId());
                if (recipient == null) throw invalid();
                LocalDateTime now = LocalDateTime.now();
                CrmEmailSuppression suppression = new CrmEmailSuppression();
                suppression.setTenantId(tenantId); suppression.setEmailHash(recipient.getEmailHash()); suppression.setReason(safeObservationText(reason));
                suppression.setSourceRecipientId(recipient.getRecipientId()); suppression.setUnsubscribedTime(now);
                suppression.setCreateBy("mail-unsubscribe"); suppression.setCreateTime(now); suppressions.insertOnce(suppression);
                if ("LEAD".equals(recipient.getTargetType())) suppressions.markLeadUnsubscribed(tenantId, recipient.getTargetId(), now);
                else if ("CUSTOMER".equals(recipient.getTargetType())) suppressions.markCustomerUnsubscribed(tenantId, recipient.getTargetId(), now);
                if (recipient.getUnsubscribedTime() == null) {
                    recipient.setUnsubscribedTime(now); CrmRecordSupport.touch(recipient); CrmRecordSupport.saved(recipients.updateById(recipient));
                    statistics.event(recipient, "UNSUBSCRIBED", now, null, safeObservationText(userAgent), ip);
                }
                return null;
            });
            refresh(reference);
        });
    }

    private void refresh(CrmMassEmailRecipient recipient) {
        if (recipient.getCampaignId() == null) return;
        try { statistics.refreshCampaign(recipient.getCampaignId()); }
        catch (RuntimeException unavailable) { log.warn("营销统计等待定时重算: campaignId={}, failureType={}", recipient.getCampaignId(), unavailable.getClass().getSimpleName()); }
    }

    private String safeObservationText(String value) {
        if (value == null) return null;
        String safe = value.replaceAll("[A-Za-z0-9_-]{43,}", "[redacted]");
        return safe.substring(0, Math.min(500, safe.length()));
    }

    private CrmBusinessException invalid() { return new CrmBusinessException("MAIL_TOKEN_INVALID: 邮件链接当前不可用"); }
}
