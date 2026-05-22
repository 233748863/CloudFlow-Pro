package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrCertificateRequestPayload;
import com.cloudflow.hr.domain.dto.HrContractSignaturePayload;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrContractSignature;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.service.HrCertificateService;
import com.cloudflow.hr.service.HrContractSignatureService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
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

    private final HrCertificateService certificateService;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;

    @GetMapping
    @SaCheckPermission("hr:ess:cert:view")
    public R<?> list(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(crudService.page(HrCertificateRequest.class, normalized));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:ess:cert:view")
    public R<Map<String, Object>> get(@PathVariable Long id) {
        Map<String, Object> row = crudService.get(HrCertificateRequest.class, id);
        Object employeeId = row == null ? null : row.get("employeeId");
        if (employeeId instanceof Number num) {
            essSupport.assertOwner(num.longValue());
        }
        return R.ok(row);
    }

    @SysLog("发起HR证明开具")
    @PostMapping
    @SaCheckPermission("hr:ess:cert:apply")
    public R<Long> submit(@RequestBody HrCertificateRequestPayload payload) {
        return R.ok(certificateService.submit(payload));
    }

    @SysLog("撤销HR证明开具")
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:ess:cert:cancel")
    public R<Void> cancel(@PathVariable Long id) {
        certificateService.cancel(id);
        return R.ok();
    }

    @GetMapping("/{id}/pdf")
    @SaCheckPermission("hr:ess:cert:view")
    public ResponseEntity<byte[]> download(@PathVariable Long id) {
        Map<String, Object> result = certificateService.downloadPdf(id);
        byte[] bytes = (byte[]) result.get("bytes");
        String fileName = String.valueOf(result.get("fileName"));
        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.set(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + fileName + "\"; filename*=UTF-8''" + encoded);
        return new ResponseEntity<>(bytes, headers, 200);
    }
}

@RestController
@RequestMapping("/ess/contracts")
@RequiredArgsConstructor
class HrEssContractController {

    private final HrContractSignatureService contractSignatureService;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;

    @GetMapping("/mine")
    @SaCheckPermission("hr:ess:contract:view")
    public R<?> mine(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(crudService.list(HrEmployeeContract.class, normalized));
    }

    @GetMapping("/signatures")
    @SaCheckPermission("hr:ess:contract:view")
    public R<?> signatures(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        normalized.put("signerId", essSupport.currentEmployeeId());
        return R.ok(crudService.list(HrContractSignature.class, normalized));
    }

    @SysLog("发起HR电子合同签署")
    @PostMapping("/{contractId}/sign-request")
    @SaCheckPermission("hr:ess:contract:sign")
    public R<Long> requestSign(@PathVariable Long contractId,
                                @RequestBody(required = false) HrContractSignaturePayload payload) {
        return R.ok(contractSignatureService.requestSign(contractId, payload));
    }

    @SysLog("撤销HR电子合同签署")
    @PostMapping("/signatures/{id}/cancel")
    @SaCheckPermission("hr:ess:contract:sign")
    public R<Void> cancel(@PathVariable Long id) {
        contractSignatureService.cancel(id);
        return R.ok();
    }
}
