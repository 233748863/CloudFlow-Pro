package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;

public interface IWorkplaceService {

    WorkplaceSummaryDTO getWorkplaceSummary(Long userId);
}
