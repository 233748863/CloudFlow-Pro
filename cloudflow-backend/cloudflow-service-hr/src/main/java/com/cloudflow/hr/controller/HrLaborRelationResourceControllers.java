package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryCompensationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryInvestigationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryQueryDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryRehabilitationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryTreatmentDTO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryCompensationVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryInvestigationVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryListVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryRehabilitationVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryTreatmentVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryVO;
import com.cloudflow.hr.service.IHrWorkInjuryCompensationService;
import com.cloudflow.hr.service.IHrWorkInjuryInvestigationService;
import com.cloudflow.hr.service.IHrWorkInjuryRehabilitationService;
import com.cloudflow.hr.service.IHrWorkInjuryService;
import com.cloudflow.hr.service.IHrWorkInjuryTreatmentService;
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

import java.util.List;

/**
 * HR 工伤管理多 Controller 聚合文件。
 *
 * <p>按工伤五链拆为 5 个独立 @RestController，共享 {@code /labor/work-injuries} base path：
 * 主表（申报+认定+关闭）、调查、医疗、赔偿、康复。
 */
@RestController
@RequestMapping("/labor/work-injuries")
@RequiredArgsConstructor
class HrWorkInjuryController {

    private final IHrWorkInjuryService hrWorkInjuryService;

    @GetMapping
    @SaCheckPermission("hr:injury:list")
    public R<PageResult<HrWorkInjuryListVO>> page(@Validated @ModelAttribute HrWorkInjuryQueryDTO query) {
        return R.ok(hrWorkInjuryService.page(query));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:injury:report:my")
    public R<PageResult<HrWorkInjuryListVO>> mine(@Validated @ModelAttribute HrWorkInjuryQueryDTO query) {
        return R.ok(hrWorkInjuryService.listMine(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:injury:list")
    public R<HrWorkInjuryVO> get(@PathVariable Long id) {
        return R.ok(hrWorkInjuryService.get(id));
    }

    @SysLog("登记工伤")
    @PostMapping
    @SaCheckPermission("hr:injury:report")
    public R<Long> create(@Validated @RequestBody HrWorkInjuryDTO dto) {
        return R.ok(hrWorkInjuryService.createInjury(dto));
    }

    @SysLog("修改工伤")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:injury:report")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrWorkInjuryDTO dto) {
        hrWorkInjuryService.updateInjury(id, dto);
        return R.ok();
    }

    @SysLog("提交工伤认定审批")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/submit-determination")
    @SaCheckPermission("hr:injury:investigate")
    public R<String> submitDetermination(@PathVariable Long id) {
        return R.ok(hrWorkInjuryService.submitDetermination(id));
    }

    @SysLog("关闭工伤")
    @PostMapping("/{id}/close")
    @SaCheckPermission("hr:injury:close")
    public R<Void> close(@PathVariable Long id,
                         @RequestParam(required = false) String reason) {
        hrWorkInjuryService.close(id, reason);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/investigations")
@RequiredArgsConstructor
class HrWorkInjuryInvestigationController {

    private final IHrWorkInjuryInvestigationService hrWorkInjuryInvestigationService;

    @GetMapping
    @SaCheckPermission("hr:injury:investigate")
    public R<List<HrWorkInjuryInvestigationVO>> list(@PathVariable Long injuryId) {
        return R.ok(hrWorkInjuryInvestigationService.listByInjury(injuryId));
    }

    @SysLog("新增工伤调查")
    @PostMapping
    @SaCheckPermission("hr:injury:investigate")
    public R<Long> create(@PathVariable Long injuryId, @Validated @RequestBody HrWorkInjuryInvestigationDTO dto) {
        return R.ok(hrWorkInjuryInvestigationService.createInvestigation(injuryId, dto));
    }

    @SysLog("修改工伤调查")
    @PutMapping("/{investigationId}")
    @SaCheckPermission("hr:injury:investigate")
    public R<Void> update(@PathVariable Long investigationId, @Validated @RequestBody HrWorkInjuryInvestigationDTO dto) {
        hrWorkInjuryInvestigationService.updateInvestigation(investigationId, dto);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/treatments")
@RequiredArgsConstructor
class HrWorkInjuryTreatmentController {

    private final IHrWorkInjuryTreatmentService hrWorkInjuryTreatmentService;

    @GetMapping
    @SaCheckPermission("hr:injury:treatment")
    public R<List<HrWorkInjuryTreatmentVO>> list(@PathVariable Long injuryId) {
        return R.ok(hrWorkInjuryTreatmentService.listByInjury(injuryId));
    }

    @SysLog("新增工伤医疗")
    @PostMapping
    @SaCheckPermission("hr:injury:treatment")
    public R<Long> create(@PathVariable Long injuryId, @Validated @RequestBody HrWorkInjuryTreatmentDTO dto) {
        return R.ok(hrWorkInjuryTreatmentService.createTreatment(injuryId, dto));
    }

    @SysLog("修改工伤医疗")
    @PutMapping("/{treatmentId}")
    @SaCheckPermission("hr:injury:treatment")
    public R<Void> update(@PathVariable Long treatmentId, @Validated @RequestBody HrWorkInjuryTreatmentDTO dto) {
        hrWorkInjuryTreatmentService.updateTreatment(treatmentId, dto);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/compensations")
@RequiredArgsConstructor
class HrWorkInjuryCompensationController {

    private final IHrWorkInjuryCompensationService hrWorkInjuryCompensationService;

    @GetMapping
    @SaCheckPermission("hr:injury:compensation")
    public R<List<HrWorkInjuryCompensationVO>> list(@PathVariable Long injuryId) {
        return R.ok(hrWorkInjuryCompensationService.listByInjury(injuryId));
    }

    @SysLog("新增工伤赔偿")
    @PostMapping
    @SaCheckPermission("hr:injury:compensation")
    public R<Long> create(@PathVariable Long injuryId, @Validated @RequestBody HrWorkInjuryCompensationDTO dto) {
        return R.ok(hrWorkInjuryCompensationService.createCompensation(injuryId, dto));
    }

    @SysLog("修改工伤赔偿")
    @PutMapping("/{compensationId}")
    @SaCheckPermission("hr:injury:compensation")
    public R<Void> update(@PathVariable Long compensationId, @Validated @RequestBody HrWorkInjuryCompensationDTO dto) {
        hrWorkInjuryCompensationService.updateCompensation(compensationId, dto);
        return R.ok();
    }

    @SysLog("标记赔偿已支付")
    @PostMapping("/{compensationId}/pay")
    @SaCheckPermission("hr:injury:compensation")
    public R<Void> markPaid(@PathVariable Long compensationId) {
        hrWorkInjuryCompensationService.markPaid(compensationId);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/rehabilitation")
@RequiredArgsConstructor
class HrWorkInjuryRehabilitationController {

    private final IHrWorkInjuryRehabilitationService hrWorkInjuryRehabilitationService;

    @GetMapping
    @SaCheckPermission("hr:injury:rehab")
    public R<List<HrWorkInjuryRehabilitationVO>> list(@PathVariable Long injuryId) {
        return R.ok(hrWorkInjuryRehabilitationService.listByInjury(injuryId));
    }

    @SysLog("新增工伤康复跟踪")
    @PostMapping
    @SaCheckPermission("hr:injury:rehab")
    public R<Long> create(@PathVariable Long injuryId, @Validated @RequestBody HrWorkInjuryRehabilitationDTO dto) {
        return R.ok(hrWorkInjuryRehabilitationService.createRehabilitation(injuryId, dto));
    }

    @SysLog("修改工伤康复跟踪")
    @PutMapping("/{rehabilitationId}")
    @SaCheckPermission("hr:injury:rehab")
    public R<Void> update(@PathVariable Long rehabilitationId, @Validated @RequestBody HrWorkInjuryRehabilitationDTO dto) {
        hrWorkInjuryRehabilitationService.updateRehabilitation(rehabilitationId, dto);
        return R.ok();
    }
}
