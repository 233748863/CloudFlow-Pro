package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.OfferCreateDTO;
import com.cloudflow.hr.domain.dto.OfferQueryDTO;
import com.cloudflow.hr.domain.vo.OfferVO;
import com.cloudflow.hr.service.OfferService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Offer管理控制器
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/offer")
@RequiredArgsConstructor
public class OfferController {

    private final OfferService offerService;

    /**
     * 创建Offer
     * 
     * @param dto Offer创建DTO
     * @return Offer ID
     */
    @PostMapping
    public R<Long> createOffer(@Validated @RequestBody OfferCreateDTO dto) {
        log.info("创建Offer，候选人ID: {}", dto.getCandidateId());
        Long id = offerService.createOffer(dto);
        return R.ok(id);
    }

    /**
     * 提交Offer审批
     * 
     * @param id Offer ID
     * @return 操作结果
     */
    @PostMapping("/{id}/submit")
    public R<Void> submitOffer(@PathVariable Long id) {
        log.info("提交Offer审批，ID: {}", id);
        offerService.submitOffer(id);
        return R.ok();
    }

    /**
     * 发送Offer
     * 
     * @param id Offer ID
     * @return 操作结果
     */
    @PostMapping("/{id}/send")
    public R<Void> sendOffer(@PathVariable Long id) {
        log.info("发送Offer，ID: {}", id);
        offerService.sendOffer(id);
        return R.ok();
    }

    /**
     * 接受Offer
     * 
     * @param id Offer ID
     * @return 操作结果
     */
    @PostMapping("/{id}/accept")
    public R<Void> acceptOffer(@PathVariable Long id) {
        log.info("接受Offer，ID: {}", id);
        offerService.acceptOffer(id);
        return R.ok();
    }

    /**
     * 拒绝Offer
     * 
     * @param id Offer ID
     * @return 操作结果
     */
    @PostMapping("/{id}/reject")
    public R<Void> rejectOffer(@PathVariable Long id) {
        log.info("拒绝Offer，ID: {}", id);
        offerService.rejectOffer(id);
        return R.ok();
    }

    /**
     * 转换为入职流程
     * 
     * @param id Offer ID
     * @return 入职申请ID
     */
    @PostMapping("/{id}/convert-to-onboarding")
    public R<Long> convertToOnboarding(@PathVariable Long id) {
        log.info("转换Offer为入职流程，ID: {}", id);
        Long onboardingId = offerService.convertToOnboarding(id);
        return R.ok(onboardingId);
    }

    /**
     * 查询Offer列表
     * 
     * @param query 查询条件
     * @return Offer列表
     */
    @GetMapping("/list")
    public R<List<OfferVO>> listOffers(OfferQueryDTO query) {
        log.info("查询Offer列表");
        List<OfferVO> list = offerService.listOffers(query);
        return R.ok(list);
    }

    /**
     * 获取Offer详情
     * 
     * @param id Offer ID
     * @return Offer详情
     */
    @GetMapping("/{id}")
    public R<OfferVO> getOffer(@PathVariable Long id) {
        log.info("查询Offer详情，ID: {}", id);
        OfferVO vo = offerService.getOffer(id);
        return R.ok(vo);
    }
}
