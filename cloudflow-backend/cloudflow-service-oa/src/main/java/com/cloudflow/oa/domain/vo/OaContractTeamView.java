package com.cloudflow.oa.domain.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record OaContractTeamView(String bizType, Long bizId, Integer businessVersion, Integer teamVersion,
        Integer currentTeamVersion, Long ownerId, BigDecimal amount, String currency, boolean historical,
        List<Member> members, List<Integer> versions) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Member(Long salesUserId, String salesUserName, Long deptId, String roleType,
            BigDecimal allocatedPercentage, BigDecimal allocatedAmount, BigDecimal commissionRate,
            BigDecimal commissionAmount, String remark, @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime createTime) { }
}
