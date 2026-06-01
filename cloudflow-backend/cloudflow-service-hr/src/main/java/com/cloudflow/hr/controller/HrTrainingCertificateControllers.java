package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.HrTrainingCertificateTemplatePayload;
import com.cloudflow.hr.domain.dto.training.HrTrainingCertificateIssueDTO;
import com.cloudflow.hr.domain.dto.training.HrTrainingCertificateRevokeDTO;
import com.cloudflow.hr.domain.dto.training.HrTrainingCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrTrainingCertificate;
import com.cloudflow.hr.domain.entity.HrTrainingCertificateTemplate;
import com.cloudflow.hr.domain.vo.training.HrTrainingArchiveVO;
import com.cloudflow.hr.domain.vo.training.HrTrainingCertificateTemplateVO;
import com.cloudflow.hr.domain.vo.training.HrTrainingCertificateVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrTrainingCertificateMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrFileStorage;
import com.cloudflow.hr.service.IHrTrainingArchiveService;
import com.cloudflow.hr.service.IHrTrainingCertificateService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 培训证书 + 培训档案控制器：颁发 / 撤销 / 重新渲染 PDF / 下载，以及按员工聚合档案视图。
 */
@RestController
@RequestMapping("/training/certificates")
@RequiredArgsConstructor
class HrTrainingCertificateController {

    private final IHrTrainingCertificateService hrTrainingCertificateService;
    private final HrTrainingCertificateMapper certificateMapper;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;
    private final HrFileStorage fileStorage;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:cert:list")
    public R<PageResult<HrTrainingCertificateVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrTrainingCertificate.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTrainingCertificateVO.class, objectMapper));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:training:cert:view")
    public R<PageResult<HrTrainingCertificateVO>> mine(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        Map<String, Object> normalized = MapConverters.toServiceQuery(query, objectMapper);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrTrainingCertificate.class, normalized),
                HrTrainingCertificateVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:cert:view")
    public R<HrTrainingCertificateVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrTrainingCertificate.class, id),
                HrTrainingCertificateVO.class, objectMapper));
    }

    @SysLog("颁发HR培训证书")
    @PostMapping("/issue")
    @SaCheckPermission("hr:training:cert:issue")
    public R<Long> issue(@Validated @RequestBody HrTrainingCertificateIssueDTO dto) {
        return R.ok(hrTrainingCertificateService.issue(dto.getEmployeeId(), dto.getCourseId(),
                dto.getSessionId(), dto.getTemplateId()));
    }

    @SysLog("撤销HR培训证书")
    @PostMapping("/{id}/revoke")
    @SaCheckPermission("hr:training:cert:issue")
    public R<Void> revoke(@PathVariable Long id,
                          @RequestBody(required = false) HrTrainingCertificateRevokeDTO dto) {
        hrTrainingCertificateService.revoke(id, dto == null ? null : dto.getReason());
        return R.ok();
    }

    @SysLog("重新渲染HR培训证书PDF")
    @PostMapping("/{id}/regenerate")
    @SaCheckPermission("hr:training:cert:issue")
    public R<Void> regenerate(@PathVariable Long id) {
        hrTrainingCertificateService.regeneratePdf(id);
        return R.ok();
    }

    @GetMapping("/{id}/pdf")
    @SaCheckPermission("hr:training:cert:view")
    public ResponseEntity<byte[]> download(@PathVariable Long id) {
        HrTrainingCertificate cert = certificateMapper.selectById(id);
        if (cert == null || Integer.valueOf(1).equals(cert.getDeleted())) {
            throw new HrBusinessException("CERTIFICATE_NOT_FOUND", "培训证书不存在：" + id);
        }
        if (cert.getPdfFileId() == null) {
            throw new HrBusinessException("CERTIFICATE_PDF_MISSING", "证书 PDF 尚未生成");
        }
        essSupport.assertOwner(cert.getEmployeeId());
        byte[] bytes = fileStorage.load(cert.getPdfFileId());
        String fileName = "training-certificate-" + cert.getCertNo() + ".pdf";
        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.set(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + fileName + "\"; filename*=UTF-8''" + encoded);
        return new ResponseEntity<>(bytes, headers, 200);
    }
}

@RestController
@RequestMapping("/training/certificate-templates")
@RequiredArgsConstructor
class HrTrainingCertificateTemplateController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:cert:list")
    public R<List<HrTrainingCertificateTemplateVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrTrainingCertificateTemplate.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTrainingCertificateTemplateVO.class, objectMapper));
    }

    @SysLog("新增培训证书模板")
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("hr:training:cert:issue")
    public R<Long> create(@RequestBody HrTrainingCertificateTemplatePayload payload) {
        return R.ok(crudService.create(HrTrainingCertificateTemplate.class, payload));
    }

    @SysLog("修改培训证书模板")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:cert:issue")
    public R<Void> update(@PathVariable Long id, @RequestBody HrTrainingCertificateTemplatePayload payload) {
        crudService.update(HrTrainingCertificateTemplate.class, id, payload);
        return R.ok();
    }

    @SysLog("删除培训证书模板")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:training:cert:issue")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTrainingCertificateTemplate.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/training/archive")
@RequiredArgsConstructor
class HrTrainingArchiveController {

    private final IHrTrainingArchiveService hrTrainingArchiveService;
    private final ObjectMapper objectMapper;

    @GetMapping("/mine")
    @SaCheckPermission("hr:training:archive:view")
    public R<HrTrainingArchiveVO> mine() {
        return R.ok(MapConverters.toVO(hrTrainingArchiveService.mine(),
                HrTrainingArchiveVO.class, objectMapper));
    }

    @GetMapping("/employees/{employeeId}")
    @SaCheckPermission("hr:training:archive:view")
    public R<HrTrainingArchiveVO> forEmployee(@PathVariable Long employeeId) {
        return R.ok(MapConverters.toVO(hrTrainingArchiveService.forEmployee(employeeId),
                HrTrainingArchiveVO.class, objectMapper));
    }
}
