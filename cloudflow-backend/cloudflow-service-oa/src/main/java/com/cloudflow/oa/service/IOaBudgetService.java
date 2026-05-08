package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaBudgetAdjustment;
import com.cloudflow.oa.domain.OaBudgetLedger;
import com.cloudflow.oa.domain.OaBudgetPlan;
import com.cloudflow.oa.domain.OaBudgetSubject;
import com.cloudflow.oa.domain.vo.BudgetExecutionSummaryVO;

public interface IOaBudgetService extends IService<OaBudgetPlan> {

    PageResult<OaBudgetPlan> queryBudgetPage(OaBudgetPlan query, PageQuery pageQuery);

    PageResult<OaBudgetSubject> querySubjectPage(OaBudgetSubject query, PageQuery pageQuery);

    PageResult<OaBudgetAdjustment> queryAdjustmentPage(OaBudgetAdjustment query, PageQuery pageQuery);

    boolean createBudget(OaBudgetPlan budgetPlan);

    boolean updateBudget(OaBudgetPlan budgetPlan);

    OaBudgetPlan getBudgetDetail(Long budgetId);

    boolean createSubject(OaBudgetSubject subject);

    boolean updateSubject(OaBudgetSubject subject);

    boolean createAdjustment(OaBudgetAdjustment adjustment);

    boolean submitBudget(Long budgetId);

    boolean submitAdjustment(Long adjustmentId);

    PageResult<OaBudgetLedger> queryLedgerPage(OaBudgetLedger query, PageQuery pageQuery);

    BudgetExecutionSummaryVO getExecutionSummary(Long budgetId, String subjectCode);

    void reserveBudget(String businessType, Long businessId, String businessNo,
                       Long deptId, String deptName, Long projectId, String projectName,
                       String subjectCode, String subjectName, java.math.BigDecimal amount, String remark);

    void releaseBudget(String businessType, Long businessId, String businessNo,
                       Long deptId, String deptName, Long projectId, String projectName,
                       String subjectCode, String subjectName, java.math.BigDecimal amount, String remark);

    void writeoffBudget(String businessType, Long businessId, String businessNo,
                        Long deptId, String deptName, Long projectId, String projectName,
                        String subjectCode, String subjectName, java.math.BigDecimal amount, String remark);
}
