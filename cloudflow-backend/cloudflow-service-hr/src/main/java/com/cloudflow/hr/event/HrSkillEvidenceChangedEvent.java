package com.cloudflow.hr.event;

public record HrSkillEvidenceChangedEvent(Long tenantId, String evidenceType, Long businessId) { }
