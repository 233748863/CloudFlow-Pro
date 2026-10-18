package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.*;
import com.cloudflow.common.excel.utils.ExcelUtil;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.domain.export.RfqComparisonExportVo;
import com.cloudflow.oa.service.impl.*;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/rfq")
@RequiredArgsConstructor
public class RfqController {
    private final OaRfqService rfqs;
    private final OaQuotationService quotations;
    private final OaQuotationFileService files;
    private final OaRfqComparisonService comparisons;
    private final OaRfqAwardService awards;
    private final OaRfqInvitationService invitations;
    private final OaPrivateFileStorageService privateFiles;

    public record DeadlineRequest(LocalDate deadline) { }
    public record EndRequest(boolean failed, String reason) { }
    public record DeclineRequest(Long supplierId, String reason) { }
    public record ConsumableRequest(Long consumableId) { }
    public record VersionRequest(@jakarta.validation.constraints.NotNull Integer version) { }

    @GetMapping
    @SaCheckPermission("oa:rfq:list")
    public R<PageResult<OaPurchaseRfq>> page(@RequestParam(required = false) String title, @RequestParam(required = false) String status, PageQuery page) { return R.ok(rfqs.page(title, status, page)); }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:rfq:list")
    public R<RfqSaveDTO> detail(@PathVariable Long id) { return R.ok(rfqs.detail(id)); }

    @PostMapping
    @SaCheckPermission("oa:rfq:edit")
    @RepeatSubmit
    @SysLog("保存询价单")
    public R<Long> save(@RequestBody RfqSaveDTO request) { return R.ok(rfqs.save(request)); }

    @PostMapping("/from-purchase/{purchaseId}")
    @SaCheckPermission("oa:rfq:edit")
    @RepeatSubmit
    @SysLog("从采购申请创建询价")
    public R<Long> createFromPurchase(@PathVariable Long purchaseId, @RequestBody DeadlineRequest request) { return R.ok(rfqs.createFromPurchase(purchaseId, request.deadline())); }

    @GetMapping("/{id}/suppliers")
    @SaCheckPermission("oa:rfq:list")
    public R<List<OaPurchaseRfqSupplier>> suppliers(@PathVariable Long id) { return R.ok(rfqs.invitations(id)); }

    @PostMapping("/{id}/invite")
    @SaCheckPermission("oa:rfq:invite")
    @RepeatSubmit
    @SysLog("登记供应商邀请")
    public R<OaRfqInvitationService.InviteResult> invite(@PathVariable Long id, @RequestBody @jakarta.validation.Valid RfqInviteDTO request) { return R.ok(rfqs.invite(id, request)); }

    @GetMapping("/email-readiness")
    @SaCheckPermission("oa:rfq:invite")
    public R<com.cloudflow.common.message.api.MessageChannelReadiness> readiness() { return R.ok(invitations.readiness()); }

    @PostMapping("/{id}/notify-award")
    @SaCheckPermission("oa:rfq:invite")
    @RepeatSubmit
    @SysLog("登记询价结果通知邮件")
    public R<Integer> notifyAward(@PathVariable Long id, @RequestBody @jakarta.validation.Valid VersionRequest request) { return R.ok(invitations.notifyAward(id, request.version())); }

    @PostMapping("/invitation-files")
    @SaCheckPermission("oa:rfq:edit")
    @RepeatSubmit
    @SysLog("上传询价邀请私有附件")
    public R<OaPrivateFileStorageService.UploadedFile> uploadInvitationFile(@RequestParam("file") MultipartFile file) { return R.ok(privateFiles.upload(OaPrivateFileStorageService.Kind.RFQ_INVITATION, file)); }

    @GetMapping("/{id}/invitation-file")
    @SaCheckPermission("oa:rfq:list")
    @SysLog("下载本询价私有附件")
    public ResponseEntity<byte[]> invitationFile(@PathVariable Long id) { return rfqs.attachment(id); }

    @PostMapping("/{id}/decline")
    @SaCheckPermission("oa:rfq:invite")
    @RepeatSubmit
    @SysLog("登记供应商拒绝报价")
    public R<Void> decline(@PathVariable Long id, @RequestBody DeclineRequest request) { rfqs.decline(id, request.supplierId(), request.reason()); return R.ok(); }

    @PostMapping("/{id}/items/{itemId}/consumable")
    @SaCheckPermission("oa:rfq:edit")
    @RepeatSubmit
    @SysLog("关联询价采购耗材")
    public R<Void> bindConsumable(@PathVariable Long id, @PathVariable Long itemId, @RequestBody ConsumableRequest request) { rfqs.bindConsumable(id, itemId, request.consumableId()); return R.ok(); }

    @PostMapping("/{id}/terminate")
    @SaCheckPermission("oa:rfq:terminate")
    @RepeatSubmit
    @SysLog("取消或流标询价")
    public R<Void> terminate(@PathVariable Long id, @RequestBody EndRequest request) { rfqs.terminate(id, request.failed(), request.reason()); return R.ok(); }

    @PostMapping("/{id}/restart")
    @SaCheckPermission("oa:rfq:edit")
    @RepeatSubmit
    @SysLog("重新发起询价")
    public R<Long> restart(@PathVariable Long id, @RequestBody DeadlineRequest request) { return R.ok(rfqs.restart(id, request.deadline())); }

    @GetMapping("/{id}/quotations")
    @SaCheckPermission("oa:rfq:quote")
    public R<List<OaSupplierQuotation>> quotations(@PathVariable Long id) { return R.ok(quotations.list(id)); }

    @GetMapping("/quotations/{quotationId}")
    @SaCheckPermission("oa:rfq:quote")
    public R<QuotationSaveDTO> quotation(@PathVariable Long quotationId) { return R.ok(quotations.detail(quotationId)); }

    @PostMapping("/quotations")
    @SaCheckPermission("oa:rfq:quote")
    @RepeatSubmit
    @SysLog("录入供应商报价")
    public R<Long> saveQuotation(@RequestBody QuotationSaveDTO request) { return R.ok(quotations.save(request)); }

    @PostMapping("/quotations/{quotationId}/submit")
    @SaCheckPermission("oa:rfq:quote")
    @RepeatSubmit
    @SysLog("提交供应商报价")
    public R<Void> submitQuotation(@PathVariable Long quotationId) { quotations.submit(quotationId); return R.ok(); }

    @PostMapping("/quotations/{quotationId}/withdraw")
    @SaCheckPermission("oa:rfq:quote")
    @RepeatSubmit
    @SysLog("撤回供应商报价")
    public R<Void> withdrawQuotation(@PathVariable Long quotationId) { quotations.withdraw(quotationId); return R.ok(); }

    @PostMapping(value = "/quotation-files", consumes = "multipart/form-data")
    @SaCheckPermission("oa:rfq:quote")
    @RepeatSubmit
    @SysLog("上传保密供应商报价附件")
    public R<OaQuotationFileService.UploadedFile> uploadQuotation(@RequestParam("file") MultipartFile file) { return R.ok(files.upload(file)); }

    @GetMapping("/quotations/{quotationId}/file")
    @SaCheckPermission("oa:rfq:quote")
    public ResponseEntity<byte[]> downloadQuotation(@PathVariable Long quotationId) { return quotations.download(quotationId); }

    @GetMapping("/{id}/comparison")
    @SaCheckPermission("oa:rfq:comparison")
    public R<OaRfqComparisonService.Comparison> comparison(@PathVariable Long id) { return R.ok(comparisons.comparison(id)); }

    @GetMapping("/{id}/comparison/export")
    @SaCheckPermission({"oa:rfq:comparison", "oa:rfq:export"})
    @SysLog("导出保密询价比价")
    public void exportComparison(@PathVariable Long id, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        ExcelUtil.exportExcel(comparisons.export(id), "询价比价表", RfqComparisonExportVo.class, response);
    }

    @PostMapping("/{id}/award")
    @SaCheckPermission({"oa:rfq:award", "oa:rfq:comparison"})
    @RepeatSubmit
    @SysLog("采购询价定标")
    public R<String> award(@PathVariable Long id, @RequestBody RfqAwardDTO request) { return R.ok(awards.award(id, request)); }

    @PostMapping("/{id}/purchase")
    @SaCheckPermission("oa:rfq:convert")
    @RepeatSubmit
    @SysLog("中标结果生成采购申请")
    public R<BizPurchaseRequest> createPurchase(@PathVariable Long id) { return R.ok(awards.createPurchase(id)); }
}
