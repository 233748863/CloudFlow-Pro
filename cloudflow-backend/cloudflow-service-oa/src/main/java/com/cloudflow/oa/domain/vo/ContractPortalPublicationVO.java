package com.cloudflow.oa.domain.vo;

import com.cloudflow.common.core.domain.PortalContractVO;
import java.util.List;

public record ContractPortalPublicationVO(String contractId, String contractNo, Integer version, boolean contractReady,
        List<String> termIds, List<String> milestoneIds, List<String> paymentScheduleIds,
        List<PortalContractVO.Term> terms, List<PortalContractVO.Milestone> milestones,
        List<PortalContractVO.PaymentSchedule> paymentSchedules) { }
