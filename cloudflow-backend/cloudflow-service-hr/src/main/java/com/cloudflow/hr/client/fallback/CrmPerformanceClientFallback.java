package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.CrmPerformanceClient;
import com.cloudflow.hr.client.vo.CrmPerformanceSummaryVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class CrmPerformanceClientFallback implements CrmPerformanceClient {

    @Override
    public R<List<CrmPerformanceSummaryVO>> summarizeByOwner(List<Long> ownerIds, String startDate, String endDate) {
        log.warn("CRM 业绩接口不可用，summarizeByOwner 降级空列表");
        return R.ok(List.of());
    }

    @Override
    public R<List<CrmPerformanceSummaryVO>> summarizeByDept(List<Long> deptIds, String startDate, String endDate) {
        log.warn("CRM 业绩接口不可用，summarizeByDept 降级空列表");
        return R.ok(List.of());
    }

    @Override
    public R<List<CrmPerformanceSummaryVO>> topOwners(int limit, String startDate, String endDate) {
        log.warn("CRM 业绩接口不可用，topOwners 降级空列表");
        return R.ok(List.of());
    }

    @Override
    public R<List<CrmPerformanceSummaryVO>> topDepartments(int limit, String startDate, String endDate) {
        log.warn("CRM 业绩接口不可用，topDepartments 降级空列表");
        return R.ok(List.of());
    }
}
