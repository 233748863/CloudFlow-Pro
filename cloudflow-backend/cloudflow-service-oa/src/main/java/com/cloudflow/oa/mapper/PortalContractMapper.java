package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.security.portal.PortalIdentity;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PortalContractMapper {
    boolean activeIdentity(@Param("identity") PortalIdentity identity);
    Page<PortalContractVO> opened(Page<PortalContractVO> page, @Param("identity") PortalIdentity identity,
            @Param("keyword") String keyword, @Param("now") LocalDateTime now);
    PortalContractVO detail(@Param("identity") PortalIdentity identity, @Param("contractId") Long contractId,
            @Param("now") LocalDateTime now);
    List<PortalContractVO.Term> terms(@Param("identity") PortalIdentity identity, @Param("contractId") Long contractId,
            @Param("now") LocalDateTime now);
    List<PortalContractVO.Milestone> milestones(@Param("identity") PortalIdentity identity, @Param("contractId") Long contractId,
            @Param("now") LocalDateTime now);
    List<PortalContractVO.PaymentSchedule> payments(@Param("identity") PortalIdentity identity, @Param("contractId") Long contractId,
            @Param("now") LocalDateTime now);
}
