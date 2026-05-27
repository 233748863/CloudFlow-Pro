package com.cloudflow.crm.service;

import com.cloudflow.crm.domain.vo.CrmPerformanceSummaryVO;

import java.util.List;

/**
 * 供 HR 绩效看板消费的销售业绩聚合。
 * 目前只做读模型：把 CRM 本地数据按 owner / dept 聚合输出。
 */
public interface ICrmPerformanceQueryService {

    /** 按员工聚合。 */
    List<CrmPerformanceSummaryVO> summarizeByOwner(List<Long> ownerIds, String startDate, String endDate);

    /** 按部门聚合。 */
    List<CrmPerformanceSummaryVO> summarizeByDept(List<Long> deptIds, String startDate, String endDate);

    /** 员工排行榜，按回款金额倒序。 */
    List<CrmPerformanceSummaryVO> topOwners(int limit, String startDate, String endDate);

    /** 部门排行榜，按回款金额倒序。 */
    List<CrmPerformanceSummaryVO> topDepartments(int limit, String startDate, String endDate);
}
