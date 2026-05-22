package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrTalentPool;

import java.util.List;
import java.util.Map;

/**
 * HR 人才池业务接口。
 *
 * <p>除常规 CRUD 外，还承担"高潜员工自动入 HiPo 池"的回调逻辑：
 * 盘点发布回调中按 grid_cell ∈ {1,4} 调用 {@link #joinDefaultHipoPool}。
 */
public interface HrTalentPoolService {

    Long createPool(Map<String, Object> payload);

    void updatePool(Long poolId, Map<String, Object> payload);

    Map<String, Object> pagePools(Map<String, Object> query);

    HrTalentPool getOrCreateDefaultHipoPool(Long tenantId);

    void joinPool(Long poolId, Long employeeId, Long sourceReviewId);

    void exitPool(Long poolId, Long employeeId, String reason);

    List<Map<String, Object>> listMembers(Long poolId);

    void joinDefaultHipoPool(Long tenantId, Long employeeId, Long sourceReviewId);
}
