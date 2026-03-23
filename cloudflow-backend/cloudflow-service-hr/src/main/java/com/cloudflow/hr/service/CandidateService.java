package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.CandidateCreateDTO;
import com.cloudflow.hr.domain.dto.CandidateQueryDTO;
import com.cloudflow.hr.domain.dto.CandidateUpdateDTO;
import com.cloudflow.hr.domain.vo.CandidateDetailVO;
import com.cloudflow.hr.domain.vo.CandidateVO;

/**
 * 候选人服务接口
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface CandidateService {

    /**
     * 创建候选人
     *
     * @param dto 候选人创建DTO
     * @return 候选人ID
     */
    Long createCandidate(CandidateCreateDTO dto);

    /**
     * 更新候选人信息
     *
     * @param id  候选人ID
     * @param dto 候选人更新DTO
     */
    void updateCandidate(Long id, CandidateUpdateDTO dto);

    /**
     * 更新候选人状态
     *
     * @param id           候选人ID
     * @param status       新状态
     * @param rejectReason 拒绝原因（状态为REJECTED时必填）
     */
    void updateCandidateStatus(Long id, String status, String rejectReason);

    /**
     * 查询候选人详情
     *
     * @param id 候选人ID
     * @return 候选人详情VO
     */
    CandidateDetailVO getCandidate(Long id);

    /**
     * 分页查询候选人列表
     *
     * @param query 查询条件
     * @return 候选人列表
     */
    Page<CandidateVO> listCandidates(CandidateQueryDTO query);
}
