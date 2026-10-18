package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.dto.HrSettlementRequests;
import com.cloudflow.hr.domain.vo.settlement.HrSettlementView;
import com.cloudflow.hr.service.HrSettlementDraftService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/settlement")
@RequiredArgsConstructor
public class HrSettlementController {
    private final HrSettlementDraftService service;
    private final com.cloudflow.hr.service.HrSettlementWorkflowService workflow;
    private final com.cloudflow.hr.service.HrSettlementConfirmationService confirmation;
    private final com.cloudflow.hr.service.HrSettlementFundsService funds;
    private final com.cloudflow.hr.service.HrSettlementClosureService closure;
    private final com.cloudflow.hr.service.HrSettlementReversalDraftService reversals;
    private final com.cloudflow.hr.service.HrSettlementAssetReminderService reminders;
    @ModelAttribute public void privateResponse(HttpServletResponse response) { response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store"); }
    @GetMapping({"", "/list"}) @SaCheckPermission("hr:settlement:list")
    public R<PageResult<HrSettlementView>> list(@Valid @ModelAttribute HrSettlementRequests.Query query) { return R.ok(service.list(query)); }
    @GetMapping("/{id}") @SaCheckPermission("hr:settlement:list")
    public R<HrSettlementView> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }
    @GetMapping("/approval-task/{taskId}") @SaCheckPermission({"hr:settlement:list", "workflow:task:complete"})
    public R<HrSettlementView> approvalDetail(@PathVariable String taskId) { return R.ok(workflow.approvalDetail(taskId)); }
    @GetMapping("/applications") @SaCheckPermission("hr:settlement:add")
    public R<PageResult<HrSettlementView.Option>> applications(@Valid @ModelAttribute HrSettlementRequests.Query query) { return R.ok(service.applications(query)); }
    @GetMapping("/{id}/policies") @SaCheckPermission("hr:settlement:edit")
    public R<PageResult<HrSettlementView.PolicyOption>> policies(@PathVariable Long id, @Valid @ModelAttribute HrSettlementRequests.Query query) { return R.ok(service.policies(id, query)); }
    @PostMapping("/{id}/refresh-source") @SaCheckPermission("hr:settlement:edit") @RepeatSubmit @SysLog(value = "更新离职结算来源日期", logParams = false)
    public R<HrSettlementView> refreshSource(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) { return R.ok(service.refreshSource(id, input)); }
    @PostMapping @SaCheckPermission("hr:settlement:add") @RepeatSubmit @SysLog(value = "创建离职结算草稿", logParams = false)
    public R<Long> create(@Valid @RequestBody HrSettlementRequests.Create input) { return R.ok(service.create(input)); }
    @PutMapping("/{id}") @SaCheckPermission("hr:settlement:edit") @RepeatSubmit @SysLog(value = "核定离职结算取样", logParams = false)
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody HrSettlementRequests.Update input) { service.update(id, input); return R.ok(); }
    @PostMapping("/{id}/calculate") @SaCheckPermission("hr:settlement:calculate") @RepeatSubmit @SysLog(value = "计算离职结算草稿", logParams = false)
    public R<HrSettlementView> calculate(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) { return R.ok(service.calculate(id, input)); }
    @PostMapping("/{id}/submit") @SaCheckPermission("hr:settlement:submit") @RepeatSubmit @SysLog(value = "提交离职结算财务复核", logParams = false)
    public R<Void> submit(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) { workflow.submit(id, input); return R.ok(); }
    @PostMapping("/{id}/withdraw") @SaCheckPermission("hr:settlement:submit") @RepeatSubmit @SysLog(value = "撤回离职结算财务复核", logParams = false)
    public R<Void> withdraw(@PathVariable Long id, @Valid @RequestBody HrHRequests.ReasonVersionDTO input) { workflow.withdraw(id, input); return R.ok(); }
    @PostMapping("/{id}/reverse") @SaCheckPermission("hr:settlement:reverse") @RepeatSubmit @SysLog(value = "建立离职结算冲正草稿", logParams = false)
    public R<Long> reverse(@PathVariable Long id, @Valid @RequestBody HrSettlementRequests.Reverse input) { return R.ok(reversals.create(id, input)); }
    @PostMapping("/{id}/reversal-submit") @SaCheckPermission("hr:settlement:reverse") @RepeatSubmit @SysLog(value = "提交结算冲正财务复核", logParams = false)
    public R<Void> submitReversal(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) { workflow.submit(id, input); return R.ok(); }
    @PostMapping("/{id}/reversal-withdraw") @SaCheckPermission("hr:settlement:reverse") @RepeatSubmit @SysLog(value = "撤回结算冲正财务复核", logParams = false)
    public R<Void> withdrawReversal(@PathVariable Long id, @Valid @RequestBody HrHRequests.ReasonVersionDTO input) { workflow.withdraw(id, input); return R.ok(); }
    @PostMapping("/{id}/confirm") @SaCheckPermission("hr:settlement:confirm") @RepeatSubmit @SysLog(value = "确认离职结算", logParams = false)
    public R<Void> confirm(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) { confirmation.confirm(id, input); return R.ok(); }
    @PostMapping("/{id}/close") @SaCheckPermission("hr:settlement:confirm") @RepeatSubmit @SysLog(value = "核对并关闭离职结算", logParams = false)
    public R<Void> close(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) { closure.close(id, input); return R.ok(); }
    @PostMapping("/{id}/receipt") @SaCheckPermission("hr:settlement:receipt") @RepeatSubmit @SysLog(value = "确认离职结算收款", logParams = false)
    public R<Void> receipt(@PathVariable Long id, @Valid @RequestBody HrSettlementRequests.Receipt input) { funds.receipt(id, input); return R.ok(); }
    @PostMapping("/{id}/proof") @SaCheckPermission("hr:settlement:receipt") @RepeatSubmit @SysLog(value = "上传结算收款凭据", logParams = false)
    public R<com.cloudflow.hr.service.HrSettlementProofService.Proof> uploadProof(@PathVariable Long id, @org.springframework.web.bind.annotation.RequestParam("file") org.springframework.web.multipart.MultipartFile file) { return R.ok(funds.uploadProof(id, file)); }
    @GetMapping("/{id}/proof/{fileId}") @SaCheckPermission("hr:settlement:list")
    public org.springframework.http.ResponseEntity<byte[]> downloadProof(@PathVariable Long id, @PathVariable Long fileId) { return funds.downloadProof(id, fileId); }
    @GetMapping("/{id}/assets/{itemId}") @SaCheckPermission("hr:settlement:edit")
    public R<com.fasterxml.jackson.databind.node.ObjectNode> assetObservation(@PathVariable Long id, @PathVariable Long itemId) { return R.ok(service.assetObservation(id, itemId)); }
    @GetMapping("/{id}/assets/{itemId}/reminder") @SaCheckPermission("hr:settlement:edit")
    public R<com.cloudflow.hr.client.vo.HrAssetReturnReminder> assetReminder(@PathVariable Long id, @PathVariable Long itemId) { return R.ok(reminders.inspect(id, itemId)); }
    @PostMapping("/{id}/assets/{itemId}/reminder") @SaCheckPermission("hr:settlement:edit") @RepeatSubmit @SysLog(value = "手动提醒离职资产归还", logParams = false)
    public R<com.cloudflow.hr.client.vo.HrAssetReturnReminder> sendAssetReminder(@PathVariable Long id, @PathVariable Long itemId, @Valid @RequestBody HrSettlementRequests.AssetReminder input) { return R.ok(reminders.send(id, itemId, input)); }
    @PostMapping("/{id}/assets/{itemId}/review") @SaCheckPermission("hr:settlement:edit") @RepeatSubmit @SysLog(value = "核定离职资产处理", logParams = false)
    public R<HrSettlementView> reviewAsset(@PathVariable Long id, @PathVariable Long itemId, @Valid @RequestBody HrSettlementRequests.AssetReview input) { return R.ok(service.reviewAsset(id, itemId, input)); }
}
