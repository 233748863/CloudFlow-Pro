package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrReferralRequests;
import com.cloudflow.hr.mapper.HrEmployeeReferralMapper;
import com.cloudflow.hr.service.HrReferralResumeService;
import com.cloudflow.hr.service.HrReferralService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/referral")
@RequiredArgsConstructor
public class HrReferralController {
    private final HrReferralService referrals;
    private final HrReferralResumeService resumes;
    private final com.cloudflow.hr.service.HrReferralBonusService bonuses;

    @PostMapping("/{id}/bonus")
    @RepeatSubmit
    @SysLog("核定内推奖金")
    @SaCheckPermission("hr:referral:bonus")
    public R<HrReferralService.View> submitBonus(@PathVariable Long id, @Valid @RequestBody HrReferralRequests.Bonus request) {
        bonuses.qualify(id, request); return R.ok(referrals.detail(id, false));
    }

    @GetMapping("/{id}/bonus-options")
    @SaCheckPermission("hr:referral:bonus")
    public R<PageResult<HrEmployeeReferralMapper.Option>> bonusOptions(@PathVariable Long id,
            @RequestParam boolean components, @Valid @ModelAttribute HrReferralRequests.Query query) {
        return R.ok(bonuses.options(id, query, components));
    }

    @GetMapping("/list")
    @SaCheckPermission("hr:referral:list")
    public R<PageResult<HrReferralService.View>> list(@Valid @ModelAttribute HrReferralRequests.Query query) {
        return R.ok(referrals.list(query, false));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:referral:own")
    public R<PageResult<HrReferralService.View>> mine(@Valid @ModelAttribute HrReferralRequests.Query query) {
        return R.ok(referrals.list(query, true));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:referral:list")
    public R<HrReferralService.View> detail(@PathVariable Long id) { return R.ok(referrals.detail(id, false)); }

    @GetMapping("/mine/{id}")
    @SaCheckPermission("hr:referral:own")
    public R<HrReferralService.View> ownDetail(@PathVariable Long id) { return R.ok(referrals.detail(id, true)); }

    @PostMapping
    @RepeatSubmit
    @SysLog("提交本人内推")
    @SaCheckPermission("hr:referral:submit")
    public R<HrReferralService.View> submit(@Valid @RequestBody HrReferralRequests.Submit request) {
        return R.ok(referrals.submit(request));
    }

    @GetMapping("/positions")
    @SaCheckPermission("hr:referral:submit")
    public R<PageResult<HrEmployeeReferralMapper.Option>> positions(@Valid @ModelAttribute HrReferralRequests.Query query) {
        return R.ok(referrals.positions(query));
    }

    @GetMapping("/{id}/requisitions")
    @SaCheckPermission("hr:referral:convert")
    public R<PageResult<HrEmployeeReferralMapper.Option>> requisitions(@PathVariable Long id, @Valid @ModelAttribute HrReferralRequests.Query query) {
        return R.ok(referrals.requisitions(id, query));
    }

    @PostMapping("/resume")
    @RepeatSubmit
    @SysLog("上传本人推荐简历")
    @SaCheckPermission("hr:referral:submit")
    public R<HrReferralResumeService.Uploaded> upload(@RequestParam MultipartFile file) { return R.ok(resumes.upload(file)); }

    @GetMapping("/{id}/resume")
    @SaCheckPermission("hr:referral:list")
    public ResponseEntity<byte[]> download(@PathVariable Long id) { return referrals.download(id, false); }

    @GetMapping("/mine/{id}/resume")
    @SaCheckPermission("hr:referral:own")
    public ResponseEntity<byte[]> ownDownload(@PathVariable Long id) { return referrals.download(id, true); }

    @PutMapping("/{id}/screening")
    @SysLog("核对内推初筛")
    @SaCheckPermission("hr:referral:manage")
    public R<HrReferralService.View> screening(@PathVariable Long id, @Valid @RequestBody HrReferralRequests.Screening request) {
        return R.ok(referrals.screening(id, request));
    }

    @PostMapping("/{id}/convert")
    @RepeatSubmit
    @SysLog("内推转换候选人")
    @SaCheckPermission("hr:referral:convert")
    public R<Long> convert(@PathVariable Long id, @Valid @RequestBody HrReferralRequests.Convert request) {
        return R.ok(referrals.convert(id, request));
    }
}
