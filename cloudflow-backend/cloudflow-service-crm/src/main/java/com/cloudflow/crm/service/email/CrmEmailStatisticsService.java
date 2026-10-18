package com.cloudflow.crm.service.email;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmCampaignLog;
import com.cloudflow.crm.domain.CrmMassEmail;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.mapper.CrmCampaignLogMapper;
import com.cloudflow.crm.mapper.CrmCampaignMapper;
import com.cloudflow.crm.mapper.CrmMassEmailMapper;
import com.cloudflow.crm.mapper.CrmMassEmailRecipientMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmEmailStatisticsService {
    private final CrmCampaignLogMapper logs;
    private final CrmCampaignMapper campaigns;
    private final CrmMassEmailMapper tasks;
    private final CrmMassEmailRecipientMapper recipients;
    private final ObjectMapper json;

    public void event(CrmMassEmailRecipient recipient, String action, LocalDateTime when, String destination, String userAgent, String ip) {
        if (recipient.getCampaignId() == null) return;
        CrmCampaignLog event = new CrmCampaignLog();
        event.setTenantId(recipient.getTenantId()); event.setCampaignId(recipient.getCampaignId()); event.setMassEmailId(recipient.getMassEmailId());
        event.setTargetType(recipient.getTargetType()); event.setTargetId(recipient.getTargetId()); event.setTargetEmail(limit(recipient.getEmailMask(), 100));
        event.setMessageRecordId(recipient.getMessageRecordId()); event.setTestFlag(recipient.getTestFlag());
        event.setAction(action); event.setActionTime(when); event.setSourceEventKey("MAIL:" + recipient.getRecipientId() + ":" + action);
        event.setClickUrl(destination); event.setUserAgent(limit(userAgent, 500)); event.setIpAddress(limit(ip, 50));
        event.setCreateBy("mail-observation"); event.setCreateTime(LocalDateTime.now()); logs.insertOnce(event);
    }

    public void refreshTask(CrmMassEmail task) {
        if (task.getRecipientSnapshotTime() == null) return;
        Map<String, Integer> counts = counts(recipients.counts(task.getTenantId(), task.getMassEmailId()), "status");
        int total = counts.values().stream().mapToInt(Integer::intValue).sum();
        int accepted = counts.getOrDefault("SENT", 0);
        int failed = counts.getOrDefault("FAILED", 0);
        int unknown = counts.getOrDefault("UNKNOWN", 0);
        int waiting = counts.getOrDefault("PENDING", 0) + counts.getOrDefault("QUEUED", 0);
        if (total != task.getTotalCount()) throw new IllegalStateException("冻结收件人数与数据库不一致");
        String summary;
        try { summary = json.writeValueAsString(counts); }
        catch (Exception invalid) { throw new IllegalStateException("邮件统计保存失败"); }
        String state = task.getStatus();
        if (!"CANCELLED".equals(state)) {
            if (waiting > 0) {
                if (!"SCHEDULED".equals(state)) state = "SENDING";
            } else state = unknown > 0 ? "UNKNOWN" : accepted == total && total > 0 ? "SENT" : accepted > 0 ? "PARTIAL" : "FAILED";
        }
        LocalDateTime end = waiting == 0 ? task.getEndTime() == null ? LocalDateTime.now() : task.getEndTime() : null;
        task.setSentCount(accepted); task.setFailedCount(failed); task.setDeliverySummary(summary); task.setStatus(state); task.setEndTime(end);
        CrmRecordSupport.touch(task); CrmRecordSupport.saved(tasks.updateById(task));
    }

    @Transactional(rollbackFor = Exception.class)
    public void refreshCampaign(Long campaignId) {
        CrmCampaign campaign = campaigns.lockById(campaignId);
        if (campaign == null) return;
        Map<String, Integer> counts = counts(logs.counts(CrmRecordSupport.tenantId(), campaignId), "action");
        int sent = counts.getOrDefault("SENT", 0);
        int delivered = counts.getOrDefault("DELIVERED", 0);
        int opened = counts.getOrDefault("OPENED", 0);
        int clicked = counts.getOrDefault("CLICKED", 0);
        int bounced = counts.getOrDefault("BOUNCED", 0);
        int unsubscribed = counts.getOrDefault("UNSUBSCRIBED", 0);
        if (Objects.equals(campaign.getSentCount(), sent) && Objects.equals(campaign.getDeliveredCount(), delivered)
                && Objects.equals(campaign.getOpenedCount(), opened) && Objects.equals(campaign.getClickedCount(), clicked)
                && Objects.equals(campaign.getBouncedCount(), bounced) && Objects.equals(campaign.getUnsubscribedCount(), unsubscribed)
                && sameRate(campaign.getOpenRate(), rate(opened, delivered)) && sameRate(campaign.getClickRate(), rate(clicked, delivered))
                && sameRate(campaign.getBounceRate(), rate(bounced, sent + bounced)) && sameRate(campaign.getUnsubscribeRate(), rate(unsubscribed, delivered))) return;
        CrmRecordSupport.saved(campaigns.update(null, new LambdaUpdateWrapper<CrmCampaign>()
                .eq(CrmCampaign::getCampaignId, campaignId).eq(CrmCampaign::getVersion, campaign.getVersion())
                .set(CrmCampaign::getSentCount, sent).set(CrmCampaign::getDeliveredCount, delivered)
                .set(CrmCampaign::getOpenedCount, opened).set(CrmCampaign::getClickedCount, clicked)
                .set(CrmCampaign::getBouncedCount, bounced).set(CrmCampaign::getUnsubscribedCount, unsubscribed)
                .set(CrmCampaign::getOpenRate, rate(opened, delivered)).set(CrmCampaign::getClickRate, rate(clicked, delivered))
                .set(CrmCampaign::getBounceRate, rate(bounced, sent + bounced)).set(CrmCampaign::getUnsubscribeRate, rate(unsubscribed, delivered))
                .set(CrmCampaign::getVersion, campaign.getVersion() + 1).set(CrmCampaign::getUpdateBy, "mail-statistics")
                .set(CrmCampaign::getUpdateTime, LocalDateTime.now())));
    }

    public List<Long> campaignIds() {
        return campaigns.selectList(new LambdaQueryWrapper<CrmCampaign>().eq(CrmCampaign::getDeleted, 0))
                .stream().map(CrmCampaign::getCampaignId).toList();
    }

    private Map<String, Integer> counts(List<Map<String, Object>> rows, String key) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) counts.put(String.valueOf(row.get(key)), Math.toIntExact(((Number) row.get("amount")).longValue()));
        return counts;
    }

    private BigDecimal rate(int numerator, int denominator) {
        return denominator == 0 ? BigDecimal.ZERO : BigDecimal.valueOf(numerator).divide(BigDecimal.valueOf(denominator), 4, RoundingMode.HALF_UP);
    }

    private boolean sameRate(BigDecimal previous, BigDecimal current) { return previous != null && previous.compareTo(current) == 0; }

    private String limit(String value, int maximum) {
        if (value == null) return null;
        String safe = value.replaceAll("[\\p{Cntrl}]", "");
        return safe.substring(0, Math.min(maximum, safe.length()));
    }
}
