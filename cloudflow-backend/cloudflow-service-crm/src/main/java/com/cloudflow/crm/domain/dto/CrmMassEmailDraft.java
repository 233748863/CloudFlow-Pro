package com.cloudflow.crm.domain.dto;

public record CrmMassEmailDraft(Long massEmailId, Long campaignId, Integer version, String subject,
        String templateCode, String fromAddress, String fromName, String replyTo) { }
