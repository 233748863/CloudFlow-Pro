package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.RecruitmentRequestCreateDTO;
import com.cloudflow.hr.domain.dto.RecruitmentRequestQueryDTO;
import com.cloudflow.hr.domain.vo.RecruitmentRequestVO;

/**
 * 招聘需求服务接口
 */
public interface RecruitmentRequestService {

    /**
     * 创建招聘需求
     *
     * @param dto 创建DTO
     * @return 招聘需求ID
     */
    Long createRecruitmentRequest(RecruitmentRequestCreateDTO dto);

    /**
     * 提交招聘需求审批
     *
     * @param requestId 招聘需求ID
     */
    void submitRecruitmentRequest(Long requestId);

    /**
     * 审批通过招聘需求
     *
     * @param requestId 招聘需求ID
     */
    void approveRecruitmentRequest(Long requestId);

    /**
     * 审批拒绝招聘需求
     *
     * @param requestId 招聘需求ID
     */
    void rejectRecruitmentRequest(Long requestId);

    /**
     * 完成招聘需求
     *
     * @param requestId 招聘需求ID
     */
    void completeRecruitmentRequest(Long requestId);

    /**
     * 取消招聘需求
     *
     * @param requestId 招聘需求ID
     */
    void cancelRecruitmentRequest(Long requestId);

    /**
     * 查询招聘需求详情
     *
     * @param requestId 招聘需求ID
     * @return 招聘需求VO
     */
    RecruitmentRequestVO getRecruitmentRequest(Long requestId);

    /**
     * 分页查询招聘需求列表
     *
     * @param query 查询条件
     * @return 分页结果
     */
    Page<RecruitmentRequestVO> listRecruitmentRequests(RecruitmentRequestQueryDTO query);
}
