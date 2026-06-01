package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.HrCandidatePayload;
import com.cloudflow.hr.domain.dto.HrInterviewPayload;
import com.cloudflow.hr.domain.dto.HrOfferPayload;
import com.cloudflow.hr.domain.dto.HrRecruitmentChannelPayload;
import com.cloudflow.hr.domain.dto.HrRecruitmentRequisitionPayload;
import com.cloudflow.hr.domain.dto.recruitment.HrRecruitmentCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrInterview;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.cloudflow.hr.domain.entity.HrRecruitmentChannel;
import com.cloudflow.hr.domain.entity.HrRecruitmentRequisition;
import com.cloudflow.hr.domain.vo.recruitment.HrCandidateVO;
import com.cloudflow.hr.domain.vo.recruitment.HrChannelStatVO;
import com.cloudflow.hr.domain.vo.recruitment.HrInterviewVO;
import com.cloudflow.hr.domain.vo.recruitment.HrOfferVO;
import com.cloudflow.hr.domain.vo.recruitment.HrRecruitmentChannelVO;
import com.cloudflow.hr.domain.vo.recruitment.HrRecruitmentRequisitionVO;
import com.cloudflow.hr.service.IHrRecruitmentChannelService;
import com.cloudflow.hr.service.HrRecruitmentService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/recruitment")
@RequiredArgsConstructor
class HrRecruitmentRequisitionController {

    private final HrTypedCrudService crudService;
    private final HrRecruitmentService recruitmentService;

    @GetMapping("/requisitions")
    @SaCheckPermission("hr:recruitment:list")
    public R<PageResult<HrRecruitmentRequisitionVO>> listRequisitions(@Validated @ModelAttribute HrRecruitmentCommonQueryDTO query) {
        return R.ok(recruitmentService.pageRequisitions(query));
    }

    @SysLog("新增HR招聘需求")
    @RepeatSubmit
    @PostMapping("/requisitions")
    @SaCheckPermission("hr:recruitment:add")
    public R<Long> createRequisition(@RequestBody HrRecruitmentRequisitionPayload payload) {
        return R.ok(crudService.create(HrRecruitmentRequisition.class, payload));
    }

    @SysLog("修改HR招聘需求")
    @PutMapping("/requisitions/{id}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> updateRequisition(@PathVariable Long id, @RequestBody HrRecruitmentRequisitionPayload payload) {
        crudService.update(HrRecruitmentRequisition.class, id, payload);
        return R.ok();
    }

    @SysLog("变更HR招聘需求状态")
    @PostMapping("/requisitions/{id}/{action}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> changeRequisitionStatus(@PathVariable Long id, @PathVariable String action) {
        recruitmentService.changeRequisitionStatus(id, action);
        return R.ok();
    }
}

@RestController
@RequestMapping("/recruitment")
@RequiredArgsConstructor
class HrCandidateController {

    private final HrTypedCrudService crudService;
    private final HrRecruitmentService recruitmentService;

    @GetMapping("/candidates")
    @SaCheckPermission("hr:recruitment:list")
    public R<PageResult<HrCandidateVO>> listCandidates(@Validated @ModelAttribute HrRecruitmentCommonQueryDTO query) {
        return R.ok(recruitmentService.pageCandidates(query));
    }

    @SysLog("新增HR候选人")
    @RepeatSubmit
    @PostMapping("/candidates")
    @SaCheckPermission("hr:recruitment:add")
    public R<Long> createCandidate(@RequestBody HrCandidatePayload payload) {
        return R.ok(crudService.create(HrCandidate.class, payload));
    }

    @SysLog("修改HR候选人")
    @PutMapping("/candidates/{id}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> updateCandidate(@PathVariable Long id, @RequestBody HrCandidatePayload payload) {
        crudService.update(HrCandidate.class, id, payload);
        return R.ok();
    }

    @SysLog("更新HR候选人状态")
    @PutMapping("/candidates/{id}/status")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> updateCandidateStatus(@PathVariable Long id,
                                         @RequestParam String status,
                                         @RequestParam(required = false) String rejectReason) {
        recruitmentService.updateCandidateStatus(id, status, rejectReason);
        return R.ok();
    }
}

@RestController
@RequestMapping("/recruitment")
@RequiredArgsConstructor
class HrInterviewController {

    private final HrTypedCrudService crudService;
    private final HrRecruitmentService recruitmentService;

    @GetMapping("/interviews")
    @SaCheckPermission("hr:recruitment:list")
    public R<List<HrInterviewVO>> listInterviews(@Validated @ModelAttribute HrRecruitmentCommonQueryDTO query) {
        return R.ok(recruitmentService.listInterviews(query));
    }

    @SysLog("新增HR面试")
    @RepeatSubmit
    @PostMapping("/interviews")
    @SaCheckPermission("hr:recruitment:add")
    public R<Long> createInterview(@RequestBody HrInterviewPayload payload) {
        return R.ok(crudService.create(HrInterview.class, payload));
    }

    @SysLog("修改HR面试")
    @PutMapping("/interviews/{id}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> updateInterview(@PathVariable Long id, @RequestBody HrInterviewPayload payload) {
        crudService.update(HrInterview.class, id, payload);
        return R.ok();
    }

    @SysLog("变更HR面试状态")
    @PostMapping("/interviews/{id}/{action}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> changeInterviewStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus(HrInterview.class, id, action);
        return R.ok();
    }
}

@RestController
@RequestMapping("/recruitment")
@RequiredArgsConstructor
class HrOfferController {

    private final HrTypedCrudService crudService;
    private final HrRecruitmentService recruitmentService;

    @GetMapping("/offers")
    @SaCheckPermission("hr:recruitment:list")
    public R<List<HrOfferVO>> listOffers(@Validated @ModelAttribute HrRecruitmentCommonQueryDTO query) {
        return R.ok(recruitmentService.listOffers(query));
    }

    @SysLog("新增HR Offer")
    @RepeatSubmit
    @PostMapping("/offers")
    @SaCheckPermission("hr:recruitment:add")
    public R<Long> createOffer(@RequestBody HrOfferPayload payload) {
        return R.ok(crudService.create(HrOffer.class, payload));
    }

    @SysLog("修改HR Offer")
    @PutMapping("/offers/{id}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> updateOffer(@PathVariable Long id, @RequestBody HrOfferPayload payload) {
        crudService.update(HrOffer.class, id, payload);
        return R.ok();
    }

    @SysLog("Offer转入入职")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/offers/{id}/convert-to-onboarding")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Long> convertOfferToOnboarding(@PathVariable Long id) {
        return R.ok(recruitmentService.convertOfferToOnboarding(id));
    }

    @SysLog("变更HR Offer状态")
    @PostMapping("/offers/{id}/{action}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> changeOfferStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus(HrOffer.class, id, action);
        return R.ok();
    }
}

/**
 * HR-P0-3 招聘渠道端点。
 */
@RestController
@RequestMapping("/recruitment")
@RequiredArgsConstructor
class HrRecruitmentChannelController {

    private final HrTypedCrudService crudService;
    private final IHrRecruitmentChannelService hrRecruitmentChannelService;
    private final ObjectMapper objectMapper;

    @GetMapping("/channels")
    @SaCheckPermission("hr:recruitment:list")
    public R<List<HrRecruitmentChannelVO>> listChannels(@Validated @ModelAttribute HrRecruitmentCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrRecruitmentChannel.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrRecruitmentChannelVO.class, objectMapper));
    }

    @SysLog("新增HR招聘渠道")
    @RepeatSubmit
    @PostMapping("/channels")
    @SaCheckPermission("hr:recruitment:add")
    public R<Long> createChannel(@RequestBody HrRecruitmentChannelPayload payload) {
        return R.ok(crudService.create(HrRecruitmentChannel.class, payload));
    }

    @SysLog("修改HR招聘渠道")
    @PutMapping("/channels/{id}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> updateChannel(@PathVariable Long id, @RequestBody HrRecruitmentChannelPayload payload) {
        crudService.update(HrRecruitmentChannel.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR招聘渠道")
    @DeleteMapping("/channels/{id}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> deleteChannel(@PathVariable Long id) {
        crudService.delete(HrRecruitmentChannel.class, id);
        return R.ok();
    }

    @GetMapping("/channels/stats")
    @SaCheckPermission("hr:recruitment:list")
    public R<List<HrChannelStatVO>> channelStats() {
        return R.ok(hrRecruitmentChannelService.channelStats());
    }
}
