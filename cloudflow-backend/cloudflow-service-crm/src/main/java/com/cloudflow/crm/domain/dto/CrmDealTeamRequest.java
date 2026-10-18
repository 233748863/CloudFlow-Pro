package com.cloudflow.crm.domain.dto;

import java.math.BigDecimal;
import java.util.List;

public record CrmDealTeamRequest(Integer teamVersion, Integer businessVersion, List<Member> members, String remark) {
    public record Member(Long salesUserId, String roleType, BigDecimal allocatedPercentage) { }
}
