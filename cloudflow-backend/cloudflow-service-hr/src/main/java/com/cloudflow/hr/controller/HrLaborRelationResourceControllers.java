package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryCompensationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryInvestigationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryQueryDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryRehabilitationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryTreatmentDTO;
import com.cloudflow.hr.domain.entity.HrWorkInjuryCompensation;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryCompensationVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryInvestigationVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryListVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryRehabilitationVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryTreatmentVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryVO;
import com.cloudflow.hr.service.HrWorkInjuryCompensationService;
import com.cloudflow.hr.service.HrWorkInjuryInvestigationService;
import com.cloudflow.hr.service.HrWorkInjuryRehabilitationService;
import com.cloudflow.hr.service.HrWorkInjuryService;
import com.cloudflow.hr.service.HrWorkInjuryTreatmentService;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:injury:list")
    public R<PageResult<HrWorkInjuryListVO>> page(@Validated @ModelAttribute HrWorkInjuryQueryDTO query) {
        Map<String, Object> raw = workInjuryService.page(MapConverters.toServiceQuery(query, objectMapper));
        return R.ok(MapConverters.toPageResult(raw, HrWorkInjuryListVO.class, objectMapper));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:injury:report:my")
    public R<PageResult<HrWorkInjuryListVO>> mine(@Validated @ModelAttribute HrWorkInjuryQueryDTO query) {
        Map<String, Object> raw = workInjuryService.listMine(MapConverters.toServiceQuery(query, objectMapper));
        return R.ok(MapConverters.toPageResult(raw, HrWorkInjuryListVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:injury:list")
    public R<HrWorkInjuryVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(workInjuryService.get(id), HrWorkInjuryVO.class, objectMapper));
    }

    @SysLog("登记工伤")
    @PostMapping
    @SaCheckPermission("hr:injury:report")
    public R<Long> create(@Validated @RequestBody HrWorkInjuryDTO dto) {
        return R.ok(workInjuryService.createInjury(MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改工伤")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:injury:report")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrWorkInjuryDTO dto) {
        workInjuryService.updateInjury(id, MapConverters.toMap(dto, objectMapper));
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
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:injury:investigate")
    public R<List<HrWorkInjuryInvestigationVO>> list(@PathVariable Long injuryId) {
        Map<String, Object> raw = investigationService.listByInjury(injuryId);
        return R.ok(MapConverters.toVOList(MapConverters.extractRows(raw),
                HrWorkInjuryInvestigationVO.class, objectMapper));
    }

    @SysLog("新增工伤调查")
    @PostMapping
    @SaCheckPermission("hr:injury:investigate")
    public R<Long> create(@PathVariable Long injuryId, @Validated @RequestBody HrWorkInjuryInvestigationDTO dto) {
        return R.ok(investigationService.createInvestigation(injuryId, MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改工伤调查")
    @PutMapping("/{investigationId}")
    @SaCheckPermission("hr:injury:investigate")
    public R<Void> update(@PathVariable Long investigationId, @Validated @RequestBody HrWorkInjuryInvestigationDTO dto) {
        investigationService.updateInvestigation(investigationId, MapConverters.toMap(dto, objectMapper));
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/treatments")
@RequiredArgsConstructor
class HrWorkInjuryTreatmentController {

    private final HrWorkInjuryTreatmentService treatmentService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:injury:treatment")
    public R<List<HrWorkInjuryTreatmentVO>> list(@PathVariable Long injuryId) {
        Map<String, Object> raw = treatmentService.listByInjury(injuryId);
        return R.ok(MapConverters.toVOList(MapConverters.extractRows(raw),
                HrWorkInjuryTreatmentVO.class, objectMapper));
    }

    @SysLog("新增工伤医疗")
    @PostMapping
    @SaCheckPermission("hr:injury:treatment")
    public R<Long> create(@PathVariable Long injuryId, @Validated @RequestBody HrWorkInjuryTreatmentDTO dto) {
        return R.ok(treatmentService.createTreatment(injuryId, MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改工伤医疗")
    @PutMapping("/{treatmentId}")
    @SaCheckPermission("hr:injury:treatment")
    public R<Void> update(@PathVariable Long treatmentId, @Validated @RequestBody HrWorkInjuryTreatmentDTO dto) {
        treatmentService.updateTreatment(treatmentId, MapConverters.toMap(dto, objectMapper));
        return R.ok();
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/compensations")
@RequiredArgsConstructor
class HrWorkInjuryCompensationController {

    private final HrWorkInjuryCompensationService compensationService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:injury:compensation")
    public R<List<HrWorkInjuryCompensationVO>> list(@PathVariable Long injuryId) {
        Map<String, Object> raw = compensationService.listByInjury(injuryId);
        List<?> rows = MapConverters.extractRows(raw);
        List<HrWorkInjuryCompensationVO> vos = MapConverters.toVOList(rows,
                HrWorkInjuryCompensationVO.class, objectMapper);
        // 银行账号脱敏：从原始 entity 取明文做掩码回填，密文不出 VO
        for (int i = 0; i < vos.size() && i < rows.size(); i++) {
            Object row = rows.get(i);
            if (row instanceof HrWorkInjuryCompensation entity) {
                String bankAccount = entity.getBankAccount();
                if (bankAccount != null && !bankAccount.isEmpty()) {
                    vos.get(i).setBankAccountMasked(mask(bankAccount));
                }
            }
        }
        return R.ok(vos);
    }

    @SysLog("新增工伤赔偿")
    @PostMapping
    @SaCheckPermission("hr:injury:compensation")
    public R<Long> create(@PathVariable Long injuryId, @Validated @RequestBody HrWorkInjuryCompensationDTO dto) {
        return R.ok(compensationService.createCompensation(injuryId, MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改工伤赔偿")
    @PutMapping("/{compensationId}")
    @SaCheckPermission("hr:injury:compensation")
    public R<Void> update(@PathVariable Long compensationId, @Validated @RequestBody HrWorkInjuryCompensationDTO dto) {
        compensationService.updateCompensation(compensationId, MapConverters.toMap(dto, objectMapper));
        return R.ok();
    }

    @SysLog("标记赔偿已支付")
    @PostMapping("/{compensationId}/pay")
    @SaCheckPermission("hr:injury:compensation")
    public R<Void> markPaid(@PathVariable Long compensationId) {
        compensationService.markPaid(compensationId);
        return R.ok();
    }

    private static String mask(String value) {
        if (value == null || value.length() <= 4) {
            return "****";
        }
        return "****" + value.substring(value.length() - 4);
    }
}

@RestController
@RequestMapping("/labor/work-injuries/{injuryId}/rehabilitation")
@RequiredArgsConstructor
class HrWorkInjuryRehabilitationController {

    private final HrWorkInjuryRehabilitationService rehabilitationService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:injury:rehab")
    public R<List<HrWorkInjuryRehabilitationVO>> list(@PathVariable Long injuryId) {
        Map<String, Object> raw = rehabilitationService.listByInjury(injuryId);
        return R.ok(MapConverters.toVOList(MapConverters.extractRows(raw),
                HrWorkInjuryRehabilitationVO.class, objectMapper));
    }

    @SysLog("新增工伤康复跟踪")
    @PostMapping
    @SaCheckPermission("hr:injury:rehab")
    public R<Long> create(@PathVariable Long injuryId, @Validated @RequestBody HrWorkInjuryRehabilitationDTO dto) {
        return R.ok(rehabilitationService.createRehabilitation(injuryId, MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改工伤康复跟踪")
    @PutMapping("/{rehabilitationId}")
    @SaCheckPermission("hr:injury:rehab")
    public R<Void> update(@PathVariable Long rehabilitationId, @Validated @RequestBody HrWorkInjuryRehabilitationDTO dto) {
        rehabilitationService.updateRehabilitation(rehabilitationId, MapConverters.toMap(dto, objectMapper));
        return R.ok();
    }
}
