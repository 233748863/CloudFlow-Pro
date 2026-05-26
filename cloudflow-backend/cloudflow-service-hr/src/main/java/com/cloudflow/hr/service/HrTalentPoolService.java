package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.talent.HrTalentPoolDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentPoolQueryDTO;
import com.cloudflow.hr.domain.entity.HrTalentPool;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolMemberVO;

import java.util.List;

/**
 * HR 人才池业务接口。
 *
 * <p>除常规 CRUD 外，还承担"高潜员工自动入 HiPo 池"的回调逻辑：
 * 盘点发布回调中按 grid_cell ∈ {1,4} 调用 {@link #joinDefaultHipoPool}。
 */
public interface HrTalentPoolService {

    Long createPool(HrTalentPoolDTO dto);

    void updatePool(Long poolId, HrTalentPoolDTO dto);

    PageResult<HrTalentPoolListVO> pagePools(HrTalentPoolQueryDTO query);

    HrTalentPool getOrCreateDefaultHipoPool(Long tenantId);

    void joinPool(Long poolId, Long employeeId, Long sourceReviewId);

    void exitPool(Long poolId, Long employeeId, String reason);

    List<HrTalentPoolMemberVO> listMembers(Long poolId);

    void joinDefaultHipoPool(Long tenantId, Long employeeId, Long sourceReviewId);
}
