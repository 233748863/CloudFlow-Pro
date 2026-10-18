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
import com.cloudflow.hr.service.HrGrievanceService;
import com.cloudflow.hr.domain.dto.HrGrievanceAction;
import com.cloudflow.hr.domain.dto.HrGrievanceQuery;
import com.cloudflow.hr.domain.dto.HrGrievanceRequest;
import com.cloudflow.hr.domain.entity.HrGrievance;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import java.util.Map;
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
    private final HrGrievanceService grievanceService;

    @GetMapping("/{id}/grievance-files/{fileId}")
    @SaCheckPermission("hr:dispute:list")
    public ResponseEntity<byte[]> downloadGrievanceFile(@PathVariable Long id, @PathVariable Long fileId) {
        return grievanceService.downloadDisputeFile(id, fileId);
    }

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
    @SaCheckPermission("hr:dispute:evidence:upload")
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
    @RepeatSubmit
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
    @RepeatSubmit
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

@RestController
@RequestMapping("/grievances")
@RequiredArgsConstructor
class HrGrievanceController {
    private final HrGrievanceService service;

    @GetMapping
    @SaCheckPermission("hr:grievance:manage:list")
    public R<PageResult<HrGrievance>> page(@ModelAttribute HrGrievanceQuery query) {
        return R.ok(service.page(query, false));
    }

    @GetMapping("/statistics")
    @SaCheckPermission("hr:grievance:manage:list")
    public R<Map<String, Object>> statistics(@ModelAttribute HrGrievanceQuery query) {
        return R.ok(service.statistics(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:grievance:manage:list")
    public R<Map<String, Object>> get(@PathVariable Long id) { return R.ok(service.detail(id, false)); }

    @GetMapping("/{id}/handlers")
    @SaCheckPermission("hr:grievance:manage:handle")
    public R<List<Map<String, Object>>> handlers(@PathVariable Long id) { return R.ok(service.handlers(id)); }

    @SysLog(value = "处理员工申诉", logParams = false)
    @RepeatSubmit
    @PostMapping("/{id}/{action}")
    @SaCheckPermission("hr:grievance:manage:handle")
    public R<Void> update(@PathVariable Long id, @PathVariable String action, @Validated @RequestBody HrGrievanceAction request) {
        service.action(id, action, request, false);
        return R.ok();
    }

    @SysLog(value = "上传申诉附件", logParams = false)
    @RepeatSubmit
    @PostMapping("/files")
    @SaCheckPermission("hr:grievance:manage:handle")
    public R<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) { return R.ok(service.upload(file, false)); }

    @GetMapping("/{id}/files/{fileId}")
    @SaCheckPermission("hr:grievance:manage:list")
    public ResponseEntity<byte[]> download(@PathVariable Long id, @PathVariable Long fileId) {
        return service.download(id, fileId, false);
    }
}

@RestController
@RequestMapping("/ess/grievances")
@RequiredArgsConstructor
class HrEssGrievanceController {
    private final HrGrievanceService service;

    @GetMapping
    @SaCheckPermission("hr:grievance:mine:list")
    public R<PageResult<HrGrievance>> page(@ModelAttribute HrGrievanceQuery query) { return R.ok(service.page(query, true)); }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:grievance:mine:list")
    public R<Map<String, Object>> get(@PathVariable Long id) { return R.ok(service.detail(id, true)); }

    @SysLog(value = "提交本人申诉", logParams = false)
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("hr:grievance:mine:create")
    public R<Long> submit(@Validated @RequestBody HrGrievanceRequest request) { return R.ok(service.submit(request)); }

    @SysLog(value = "更新本人申诉", logParams = false)
    @RepeatSubmit
    @PostMapping("/{id}/{action}")
    @SaCheckPermission("hr:grievance:mine:update")
    public R<Void> update(@PathVariable Long id, @PathVariable String action, @Validated @RequestBody HrGrievanceAction request) {
        service.action(id, action, request, true);
        return R.ok();
    }

    @SysLog(value = "上传本人申诉附件", logParams = false)
    @RepeatSubmit
    @PostMapping("/files")
    @SaCheckPermission("hr:grievance:mine:create")
    public R<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) { return R.ok(service.upload(file, true)); }

    @GetMapping("/{id}/files/{fileId}")
    @SaCheckPermission("hr:grievance:mine:list")
    public ResponseEntity<byte[]> download(@PathVariable Long id, @PathVariable Long fileId) {
        return service.download(id, fileId, true);
    }
}
