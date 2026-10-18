package com.cloudflow.crm.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.domain.dto.CrmSalesTargetWriteDTO;
import com.cloudflow.crm.domain.vo.CrmSalesTargetPreviewVO;
import java.util.List;

public interface ICrmSalesTargetService {
    PageResult<CrmSalesTarget> queryPage(CrmSalesTarget query, PageQuery pageQuery);
    CrmSalesTarget detail(Long id);
    CrmSalesTarget creation(String requestKey);
    CrmSalesTarget createSalesTarget(CrmSalesTargetWriteDTO request);
    CrmSalesTarget updateSalesTarget(CrmSalesTargetWriteDTO request);
    CrmSalesTargetPreviewVO preview(CrmSalesTargetWriteDTO request);
    void removeSalesTargets(List<Long> ids, List<Integer> versions);
}
