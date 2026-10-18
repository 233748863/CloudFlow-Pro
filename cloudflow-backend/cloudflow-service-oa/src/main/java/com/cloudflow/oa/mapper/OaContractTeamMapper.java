package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaContractTeam;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaContractTeamMapper extends BaseMapper<OaContractTeam> {
    record QuoteSource(Long quoteId, Long tenantId, Long customerId, String customerName, Long ownerId, String currency, Integer version) { }
    record OpportunitySource(Long opportunityId, Long tenantId, Long customerId, String stage, String status, Integer version) { }

    OpportunitySource lockOpportunitySource(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("dataScope") DataScope dataScope);
    OpportunitySource quoteOpportunity(@Param("id") Long id, @Param("tenantId") Long tenantId);
    QuoteSource lockQuoteSource(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("dataScope") DataScope dataScope);
    List<OaContractTeam> lockQuoteTeam(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<Integer> quoteVersions(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<OaContract> quoteContracts(@Param("id") Long id, @Param("tenantId") Long tenantId);
    boolean hasHistory(@Param("id") Long id, @Param("tenantId") Long tenantId);
    boolean hasCurrencyHistory(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<Integer> versions(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<OaContractTeam> rows(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("version") Integer version);
    List<OaContractTeam> lockCurrent(@Param("id") Long id, @Param("tenantId") Long tenantId);
    int retireCurrent(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("version") Integer version,
            @Param("actor") String actor, @Param("now") LocalDateTime now);
    int updatePreview(@Param("row") OaContractTeam row);
}
