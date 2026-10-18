package com.cloudflow.oa.mapper;

import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaContract;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaContractPortalMapper {
    OaContract contract(@Param("tenantId") Long tenantId, @Param("contractId") Long contractId,
            @Param("lock") boolean lock, @Param("dataScope") DataScope dataScope);
    boolean ready(@Param("tenantId") Long tenantId, @Param("contractId") Long contractId, @Param("now") LocalDateTime now);
    List<PortalContractVO.Term> terms(@Param("tenantId") Long tenantId, @Param("contractId") Long contractId,
            @Param("now") LocalDateTime now);
    List<PortalContractVO.Milestone> milestones(@Param("tenantId") Long tenantId, @Param("contractId") Long contractId);
    List<PortalContractVO.PaymentSchedule> payments(@Param("tenantId") Long tenantId, @Param("contractId") Long contractId);
    List<Long> lockTerms(@Param("tenantId") Long tenantId, @Param("contractId") Long contractId, @Param("ids") List<Long> ids);
    List<Long> lockMilestones(@Param("tenantId") Long tenantId, @Param("contractId") Long contractId, @Param("ids") List<Long> ids);
    List<Long> lockPayments(@Param("tenantId") Long tenantId, @Param("contractId") Long contractId, @Param("ids") List<Long> ids);
    int save(@Param("contract") OaContract contract);
}
