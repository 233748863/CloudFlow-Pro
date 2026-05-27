package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrCertificateRequestPayload;
import com.cloudflow.hr.domain.dto.HrContractSignaturePayload;
import com.cloudflow.hr.domain.dto.ess.HrEssCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrContractSignature;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.vo.ess.HrCertificateRequestVO;
import com.cloudflow.hr.domain.vo.ess.HrContractSignatureVO;
import com.cloudflow.hr.domain.vo.ess.HrEmployeeContractVO;
import com.cloudflow.hr.service.IHrCertificateService;
import com.cloudflow.hr.service.IHrContractSignatureService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.dto.HrFileDownload;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * ESS（员工自助）工作流类资源：证明开具 + 电子合同签署。
 *
 * <p>这两条业务都走 workflow startProcess → APPROVED 回调写回的链路，
 * 共用同一份 employeeId 守卫 {@link HrEssSupport#assertOwner(Long)}。
 */
@RestController
@RequestMapping("/ess/certificates")
@RequiredArgsConstructor
class HrCertificateRequestController {

    private final IHrCertificateService hrCertificateService;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:ess:cert:view")
    public R<PageResult<HrCertificateRequestVO>> list(@Validated @ModelAttribute HrEssCommonQueryDTO query) {
        Map<String, Object> normalized = MapConverters.toServiceQuery(query, objectMapper);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrCertificateRequest.class, normalized),
                HrCertificateRequestVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:ess:cert:view")
    public R<HrCertificateRequestVO> get(@PathVariable Long id) {
        Map<String, Object> row = crudService.get(HrCertificateRequest.class, id);
        Object employeeId = row == null ? null : row.get("employeeId");
        if (employeeId instanceof Number num) {
            essSupport.assertOwner(num.longValue());
        }
        return R.ok(MapConverters.toVO(row, HrCertificateRequestVO.class, objectMapper));
    }

    @SysLog("发起HR证明开具")
    @PostMapping
    @SaCheckPermission("hr:ess:cert:apply")
    public R<Long> submit(@RequestBody HrCertificateRequestPayload payload) {
        return R.ok(hrCertificateService.submit(payload));
    }

    @SysLog("撤销HR证明开具")
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:ess:cert:cancel")
    public R<Void> cancel(@PathVariable Long id) {
        hrCertificateService.cancel(id);
        return R.ok();
    }

    @GetMapping("/{id}/pdf")
    @SaCheckPermission("hr:ess:cert:view")
    public ResponseEntity<byte[]> download(@PathVariable Long id) {
        HrFileDownload result = hrCertificateService.downloadPdf(id);
        String fileName = result.getFileName();
        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.set(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + fileName + "\"; filename*=UTF-8''" + encoded);
        return new ResponseEntity<>(result.getBytes(), headers, 200);
    }
}

@RestController
@RequestMapping("/ess/contracts")
@RequiredArgsConstructor
class HrEssContractController {

    private final IHrContractSignatureService hrContractSignatureService;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;
    private final ObjectMapper objectMapper;

    @GetMapping("/mine")
    @SaCheckPermission("hr:ess:contract:view")
    public R<List<HrEmployeeContractVO>> mine(@Validated @ModelAttribute HrEssCommonQueryDTO query) {
        Map<String, Object> normalized = MapConverters.toServiceQuery(query, objectMapper);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmployeeContract.class, normalized),
                HrEmployeeContractVO.class, objectMapper));
    }

    @GetMapping("/signatures")
    @SaCheckPermission("hr:ess:contract:view")
    public R<List<HrContractSignatureVO>> signatures(@Validated @ModelAttribute HrEssCommonQueryDTO query) {
        Map<String, Object> normalized = MapConverters.toServiceQuery(query, objectMapper);
        normalized.put("signerId", essSupport.currentEmployeeId());
        return R.ok(MapConverters.toVOList(
                crudService.list(HrContractSignature.class, normalized),
                HrContractSignatureVO.class, objectMapper));
    }

    @SysLog("发起HR电子合同签署")
    @PostMapping("/{contractId}/sign-request")
    @SaCheckPermission("hr:ess:contract:sign")
    public R<Long> requestSign(@PathVariable Long contractId,
                                @RequestBody(required = false) HrContractSignaturePayload payload) {
        return R.ok(hrContractSignatureService.requestSign(contractId, payload));
    }

    @SysLog("撤销HR电子合同签署")
    @PostMapping("/signatures/{id}/cancel")
    @SaCheckPermission("hr:ess:contract:sign")
    public R<Void> cancel(@PathVariable Long id) {
        hrContractSignatureService.cancel(id);
        return R.ok();
    }
}
