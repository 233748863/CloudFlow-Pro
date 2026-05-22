package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.service.HrWorkInjuryCompensationService;
import com.cloudflow.hr.service.HrWorkInjuryInvestigationService;
import com.cloudflow.hr.service.HrWorkInjuryRehabilitationService;
import com.cloudflow.hr.service.HrWorkInjuryService;
import com.cloudflow.hr.service.HrWorkInjuryTreatmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

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

    private final HrWorkInjuryService workInjuryService;

    @GetMapping
    @SaCheckPermission("hr:injury:list")
    public R<?> page(@RequestParam Map<String, Object> query) {
        return R.ok(workInjuryService.page(query));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:injury:report:my")
    public R<?> mine(@RequestParam Map<String, Object> query) {
        return R.ok(workInjuryService.listMine(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:injury:list")
    public R<?> get(@PathVariable Long id) {
        return R.ok(workInjuryService.get(id));
    }

    @SysLog("登记工伤")
    @PostMapping
    @SaCheckPermission("hr:injury:report")
    public R<Long> create(@RequestBody Map<String, Object> payload) {
        return R.ok(workInjuryService.createInjury(payload));
    }

    @SysLog("修改工伤")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:injury:report")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        workInjuryService.updateInjury(id, payload);
        return R.ok();
    }

    @SysLog("提交工伤认定审批")
    @PostMapping("/{id}/submit-determination")
    @SaCheckPermission("hr:injury:investigate")
    public R<String> submitDetermination(@PathVariable Long id) {
        return R.ok(workInjuryService.submitDetermination(id));
    }

    @SysLog("关闭工伤")
    @PostMapping("/{id}/close")
    @SaCheckPermission("hr:injury:close")
    public R<Void> close(@PathVariable Long id,
                         @RequestParam(required = false) String reason) {
        workInjuryService.close(id, reason);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/investigations")
@RequiredArgsConstructor
class HrWorkInjuryInvestigationController {

    private final HrWorkInjuryInvestigationService investigationService;

    @GetMapping
    @SaCheckPermission("hr:injury:investigate")
    public R<?> list(@PathVariable Long injuryId) {
        return R.ok(investigationService.listByInjury(injuryId));
    }

    @SysLog("新增工伤调查")
    @PostMapping
    @SaCheckPermission("hr:injury:investigate")
    public R<Long> create(@PathVariable Long injuryId, @RequestBody Map<String, Object> payload) {
        return R.ok(investigationService.createInvestigation(injuryId, payload));
    }

    @SysLog("修改工伤调查")
    @PutMapping("/{investigationId}")
    @SaCheckPermission("hr:injury:investigate")
    public R<Void> update(@PathVariable Long investigationId, @RequestBody Map<String, Object> payload) {
        investigationService.updateInvestigation(investigationId, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/treatments")
@RequiredArgsConstructor
class HrWorkInjuryTreatmentController {

    private final HrWorkInjuryTreatmentService treatmentService;

    @GetMapping
    @SaCheckPermission("hr:injury:treatment")
    public R<?> list(@PathVariable Long injuryId) {
        return R.ok(treatmentService.listByInjury(injuryId));
    }

    @SysLog("新增工伤医疗")
    @PostMapping
    @SaCheckPermission("hr:injury:treatment")
    public R<Long> create(@PathVariable Long injuryId, @RequestBody Map<String, Object> payload) {
        return R.ok(treatmentService.createTreatment(injuryId, payload));
    }

    @SysLog("修改工伤医疗")
    @PutMapping("/{treatmentId}")
    @SaCheckPermission("hr:injury:treatment")
    public R<Void> update(@PathVariable Long treatmentId, @RequestBody Map<String, Object> payload) {
        treatmentService.updateTreatment(treatmentId, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/compensations")
@RequiredArgsConstructor
class HrWorkInjuryCompensationController {

    private final HrWorkInjuryCompensationService compensationService;

    @GetMapping
    @SaCheckPermission("hr:injury:compensation")
    public R<?> list(@PathVariable Long injuryId) {
        return R.ok(compensationService.listByInjury(injuryId));
    }

    @SysLog("新增工伤赔偿")
    @PostMapping
    @SaCheckPermission("hr:injury:compensation")
    public R<Long> create(@PathVariable Long injuryId, @RequestBody Map<String, Object> payload) {
        return R.ok(compensationService.createCompensation(injuryId, payload));
    }

    @SysLog("修改工伤赔偿")
    @PutMapping("/{compensationId}")
    @SaCheckPermission("hr:injury:compensation")
    public R<Void> update(@PathVariable Long compensationId, @RequestBody Map<String, Object> payload) {
        compensationService.updateCompensation(compensationId, payload);
        return R.ok();
    }

    @SysLog("标记赔偿已支付")
    @PostMapping("/{compensationId}/pay")
    @SaCheckPermission("hr:injury:compensation")
    public R<Void> markPaid(@PathVariable Long compensationId) {
        compensationService.markPaid(compensationId);
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/rehabilitation")
@RequiredArgsConstructor
class HrWorkInjuryRehabilitationController {

    private final HrWorkInjuryRehabilitationService rehabilitationService;

    @GetMapping
    @SaCheckPermission("hr:injury:rehab")
    public R<?> list(@PathVariable Long injuryId) {
        return R.ok(rehabilitationService.listByInjury(injuryId));
    }

    @SysLog("新增工伤康复跟踪")
    @PostMapping
    @SaCheckPermission("hr:injury:rehab")
    public R<Long> create(@PathVariable Long injuryId, @RequestBody Map<String, Object> payload) {
        return R.ok(rehabilitationService.createRehabilitation(injuryId, payload));
    }

    @SysLog("修改工伤康复跟踪")
    @PutMapping("/{rehabilitationId}")
    @SaCheckPermission("hr:injury:rehab")
    public R<Void> update(@PathVariable Long rehabilitationId, @RequestBody Map<String, Object> payload) {
        rehabilitationService.updateRehabilitation(rehabilitationId, payload);
        return R.ok();
    }
}
