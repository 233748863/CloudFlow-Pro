package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeArbitrationDTO;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeEvidenceDTO;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeMediationDTO;
import com.cloudflow.hr.domain.dto.dispute.HrLaborDisputeDTO;
import com.cloudflow.hr.domain.dto.dispute.HrLaborDisputeQueryDTO;
import com.cloudflow.hr.domain.vo.dispute.HrDisputeArbitrationVO;
import com.cloudflow.hr.domain.vo.dispute.HrDisputeEvidenceVO;
import com.cloudflow.hr.domain.vo.dispute.HrDisputeMediationVO;
import com.cloudflow.hr.domain.vo.dispute.HrLaborDisputeVO;
import com.cloudflow.hr.service.IHrDisputeArbitrationService;
import com.cloudflow.hr.service.IHrDisputeMediationService;
import com.cloudflow.hr.service.IHrLaborDisputeService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * HR 劳动争议多 Controller 聚合文件。
 *
 * <p>按争议-调解-仲裁三段拆为 3 个独立 @RestController，共享 {@code /labor/disputes} base path：
 * 主表（登记+提交+关闭+证据）、调解记录、仲裁记录。
 */
@RestController
@RequestMapping("/labor/disputes")
@RequiredArgsConstructor
class HrLaborDisputeController {

    private final IHrLaborDisputeService hrLaborDisputeService;

    @GetMapping
    @SaCheckPermission("hr:dispute:list")
    public R<PageResult<HrLaborDisputeVO>> page(@Validated @ModelAttribute HrLaborDisputeQueryDTO query) {
        return R.ok(hrLaborDisputeService.page(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:dispute:list")
    public R<HrLaborDisputeVO> get(@PathVariable Long id) {
        return R.ok(hrLaborDisputeService.get(id));
    }

    @SysLog("登记劳动争议")
    @PostMapping
    @SaCheckPermission("hr:dispute:register")
    public R<Long> register(@Validated @RequestBody HrLaborDisputeDTO dto) {
        return R.ok(hrLaborDisputeService.registerDispute(dto));
    }

    @SysLog("修改劳动争议")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:dispute:register")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrLaborDisputeDTO dto) {
        hrLaborDisputeService.updateDispute(id, dto);
        return R.ok();
    }

    @SysLog("提交劳动争议审批")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/submit")
    @SaCheckPermission("hr:dispute:register")
    public R<String> submit(@PathVariable Long id) {
        return R.ok(hrLaborDisputeService.submitWorkflow(id));
    }

    @SysLog("关闭劳动争议")
    @PostMapping("/{id}/close")
    @SaCheckPermission("hr:dispute:close")
    public R<Void> close(@PathVariable Long id,
                         @RequestParam(required = false) String reason) {
        hrLaborDisputeService.close(id, reason);
        return R.ok();
    }

    @GetMapping("/{id}/evidence")
    @SaCheckPermission("hr:dispute:list")
    public R<PageResult<HrDisputeEvidenceVO>> listEvidence(@PathVariable Long id) {
        return R.ok(hrLaborDisputeService.listEvidence(id));
    }

    @SysLog("上传争议证据")
    @PostMapping("/{id}/evidence")
    @SaCheckPermission("hr:dispute:upload-evidence")
    public R<Long> uploadEvidence(@PathVariable Long id, @Validated @RequestBody HrDisputeEvidenceDTO dto) {
        return R.ok(hrLaborDisputeService.attachEvidence(id, dto));
    }
}

@RestController
@RequestMapping("/labor/disputes/{disputeId}/mediations")
@RequiredArgsConstructor
class HrDisputeMediationController {

    private final IHrDisputeMediationService hrDisputeMediationService;

    @GetMapping
    @SaCheckPermission("hr:dispute:mediation")
    public R<PageResult<HrDisputeMediationVO>> list(@PathVariable Long disputeId) {
        return R.ok(hrDisputeMediationService.listByDispute(disputeId));
    }

    @SysLog("新增争议调解记录")
    @PostMapping
    @SaCheckPermission("hr:dispute:mediation")
    public R<Long> create(@PathVariable Long disputeId, @Validated @RequestBody HrDisputeMediationDTO dto) {
        return R.ok(hrDisputeMediationService.createMediation(disputeId, dto));
    }

    @SysLog("修改争议调解记录")
    @PutMapping("/{mediationId}")
    @SaCheckPermission("hr:dispute:mediation")
    public R<Void> update(@PathVariable Long mediationId, @Validated @RequestBody HrDisputeMediationDTO dto) {
        hrDisputeMediationService.updateMediation(mediationId, dto);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/disputes/{disputeId}/arbitrations")
@RequiredArgsConstructor
class HrDisputeArbitrationController {

    private final IHrDisputeArbitrationService hrDisputeArbitrationService;

    @GetMapping
    @SaCheckPermission("hr:dispute:arbitration")
    public R<PageResult<HrDisputeArbitrationVO>> list(@PathVariable Long disputeId) {
        return R.ok(hrDisputeArbitrationService.listByDispute(disputeId));
    }

    @SysLog("新增争议仲裁记录")
    @PostMapping
    @SaCheckPermission("hr:dispute:arbitration")
    public R<Long> create(@PathVariable Long disputeId, @Validated @RequestBody HrDisputeArbitrationDTO dto) {
        return R.ok(hrDisputeArbitrationService.createArbitration(disputeId, dto));
    }

    @SysLog("修改争议仲裁记录")
    @PutMapping("/{arbitrationId}")
    @SaCheckPermission("hr:dispute:arbitration")
    public R<Void> update(@PathVariable Long arbitrationId, @Validated @RequestBody HrDisputeArbitrationDTO dto) {
        hrDisputeArbitrationService.updateArbitration(arbitrationId, dto);
        return R.ok();
    }
}
