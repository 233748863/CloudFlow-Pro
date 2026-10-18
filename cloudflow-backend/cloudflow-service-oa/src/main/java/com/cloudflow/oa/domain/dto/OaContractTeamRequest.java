package com.cloudflow.oa.domain.dto;

import java.math.BigDecimal;
import java.util.List;

public record OaContractTeamRequest(Integer teamVersion, Integer businessVersion, List<Member> members, String remark) {
    public record Member(Long salesUserId, String roleType, BigDecimal allocatedPercentage) { }
}
