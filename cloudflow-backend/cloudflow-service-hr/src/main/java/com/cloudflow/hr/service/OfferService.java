package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.OfferCreateDTO;
import com.cloudflow.hr.domain.dto.OfferQueryDTO;
import com.cloudflow.hr.domain.vo.OfferVO;

import java.util.List;

/**
 * Offer 服务接口
 */
public interface OfferService {

    /**
     * 创建 Offer
     *
     * @param dto Offer 创建DTO
     * @return Offer ID
     */
    Long createOffer(OfferCreateDTO dto);

    /**
     * 提交 Offer 审批
     *
     * @param id Offer ID
     */
    void submitOffer(Long id);

    /**
     * 审批通过 Offer
     *
     * @param id Offer ID
     */
    void approveOffer(Long id);

    /**
     * 审批拒绝 Offer
     *
     * @param id Offer ID
     */
    void rejectOffer(Long id);

    /**
     * 发送 Offer 给候选人
     *
     * @param id Offer ID
     */
    void sendOffer(Long id);

    /**
     * 候选人接受 Offer
     *
     * @param id Offer ID
     */
    void acceptOffer(Long id);

    /**
     * 转换为入职流程
     *
     * @param id Offer ID
     * @return 入职申请ID
     */
    Long convertToOnboarding(Long id);

    /**
     * 查询 Offer 列表
     *
     * @param query 查询条件
     * @return Offer 列表
     */
    List<OfferVO> listOffers(OfferQueryDTO query);

    /**
     * 获取 Offer 详情
     *
     * @param id Offer ID
     * @return Offer 详情
     */
    OfferVO getOffer(Long id);
}
