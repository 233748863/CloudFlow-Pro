package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.OaSealExpiryReminderLog;
import com.cloudflow.oa.domain.OaSealHandoverLog;
import com.cloudflow.oa.domain.OaSealRenewal;
import com.cloudflow.oa.domain.dto.OaBorrowActionDTO;
import com.cloudflow.oa.service.IOaSealApplicationService;
import com.cloudflow.oa.service.IOaSealRenewalService;
import com.cloudflow.oa.service.IOaSealService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 用印管理 Controller。
 */
@RestController
@RequestMapping("/seal")
@RequiredArgsConstructor
public class SealController {

    private final IOaSealService oaSealService;
    private final IOaSealApplicationService oaSealApplicationService;
    private final IOaSealRenewalService oaSealRenewalService;

    @GetMapping("/list")
    @SaCheckPermission("oa:seal:list")
    public R<PageResult<OaSeal>> list(OaSeal query, PageQuery pageQuery) {
        return R.ok(oaSealService.queryPage(query, pageQuery));
    }

    @GetMapping("/available")
    @SaCheckPermission(value = {"oa:seal:list", "oa:seal:list"}, mode = SaMode.OR)
    public R<List<OaSeal>> listAvailable() {
        return R.ok(oaSealService.listAvailable());
    }

    @GetMapping("/expiring")
    @SaCheckPermission("oa:seal:list")
    public R<PageResult<OaSeal>> listExpiring(@RequestParam(value = "days", required = false) Integer days,
                                              PageQuery pageQuery) {
        return R.ok(oaSealService.queryExpiringPage(days, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:seal:list")
    public R<OaSeal> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(oaSealService.getSealInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增印章")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:seal:add")
    public R<Void> add(@RequestBody OaSeal seal) {
        try {
            return R.result(oaSealService.createSeal(seal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改印章")
    @PutMapping
    @SaCheckPermission("oa:seal:edit")
    public R<Void> edit(@RequestBody OaSeal seal) {
        try {
            return R.result(oaSealService.updateSeal(seal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除印章")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:seal:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(oaSealService.removeSeals(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/expiry-reminder-logs")
    @SaCheckPermission("oa:seal:list")
    public R<List<OaSealExpiryReminderLog>> listExpiryReminderLogs(@PathVariable("id") Long id) {
        return R.ok(oaSealService.listExpiryReminderLogs(id));
    }

    @SysLog("印章到期提醒")
    @PostMapping("/{id}/expiry-remind")
    @SaCheckPermission("oa:seal:remind")
    public R<Void> remindExpiry(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(oaSealService.remindExpiry(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/application/list")
    @SaCheckPermission("oa:seal:list")
    public R<PageResult<OaSealApplication>> listApplications(OaSealApplication query, PageQuery pageQuery) {
        return R.ok(oaSealApplicationService.queryPage(query, pageQuery));
    }

    @GetMapping("/application/overdue")
    @SaCheckPermission("oa:seal:list")
    public R<PageResult<OaSealApplication>> listOverdue(PageQuery pageQuery) {
        return R.ok(oaSealApplicationService.queryOverduePage(pageQuery));
    }

    @GetMapping("/application/{id}")
    @SaCheckPermission("oa:seal:list")
    public R<OaSealApplication> getApplication(@PathVariable("id") Long id) {
        try {
            return R.ok(oaSealApplicationService.getApplicationInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/application/{id}/handover-logs")
    @SaCheckPermission("oa:seal:list")
    public R<List<OaSealHandoverLog>> listHandoverLogs(@PathVariable("id") Long id) {
        return R.ok(oaSealApplicationService.listHandoverLogs(id));
    }

    @GetMapping("/application/{id}/reminder-logs")
    @SaCheckPermission("oa:seal:list")
    public R<List<OaBorrowReminderLog>> listReminderLogs(@PathVariable("id") Long id) {
        return R.ok(oaSealApplicationService.listReminderLogs(id));
    }

    @SysLog("新增用印申请")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/application")
    @SaCheckPermission("oa:seal:add")
    public R<Void> addApplication(@RequestBody OaSealApplication application) {
        try {
            return R.result(oaSealApplicationService.createApplication(application));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改用印申请")
    @PutMapping("/application")
    @SaCheckPermission("oa:seal:edit")
    public R<Void> editApplication(@RequestBody OaSealApplication application) {
        try {
            return R.result(oaSealApplicationService.updateApplication(application));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除用印申请")
    @DeleteMapping("/application/{ids}")
    @SaCheckPermission("oa:seal:remove")
    public R<Void> removeApplications(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(oaSealApplicationService.removeApplications(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交用印申请")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/application/submit/{id}")
    @SaCheckPermission("oa:seal:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(oaSealApplicationService.submitApplication(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消用印申请")
    @PutMapping("/application/cancel/{id}")
    @SaCheckPermission("oa:seal:cancel")
    public R<Void> cancel(@PathVariable("id") Long id) {
        try {
            return R.result(oaSealApplicationService.cancelApplication(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认借出印章")
    @PutMapping("/application/{id}/borrow")
    @SaCheckPermission("oa:borrow:confirm")
    public R<Void> confirmBorrow(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(oaSealApplicationService.confirmBorrow(id,
                    dto == null ? null : dto.getRemark(),
                    dto == null ? null : dto.getAttachmentUrl()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认归还印章")
    @PutMapping("/application/{id}/return")
    @SaCheckPermission("oa:borrow:return")
    public R<Void> confirmReturn(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(oaSealApplicationService.confirmReturn(id,
                    dto == null ? null : dto.getRemark(),
                    dto == null ? null : dto.getAttachmentUrl()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("催还印章")
    @PostMapping("/application/{id}/remind")
    @SaCheckPermission("oa:borrow:remind")
    public R<Void> remind(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(oaSealApplicationService.remind(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/renewal/list")
    @SaCheckPermission("oa:seal:list")
    public R<PageResult<OaSealRenewal>> listRenewals(OaSealRenewal query, PageQuery pageQuery) {
        return R.ok(oaSealRenewalService.queryPage(query, pageQuery));
    }

    @GetMapping("/renewal/{id}")
    @SaCheckPermission("oa:seal:list")
    public R<OaSealRenewal> getRenewal(@PathVariable("id") Long id) {
        try {
            return R.ok(oaSealRenewalService.getRenewalInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增印章续期申请")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/renewal")
    @SaCheckPermission("oa:seal-renewal:add")
    public R<Void> addRenewal(@RequestBody OaSealRenewal renewal) {
        try {
            return R.result(oaSealRenewalService.createRenewal(renewal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改印章续期申请")
    @PutMapping("/renewal")
    @SaCheckPermission("oa:seal-renewal:edit")
    public R<Void> editRenewal(@RequestBody OaSealRenewal renewal) {
        try {
            return R.result(oaSealRenewalService.updateRenewal(renewal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除印章续期申请")
    @DeleteMapping("/renewal/{ids}")
    @SaCheckPermission("oa:seal-renewal:remove")
    public R<Void> removeRenewals(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(oaSealRenewalService.removeRenewals(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交印章续期申请")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/renewal/submit/{id}")
    @SaCheckPermission("oa:seal-renewal:submit")
    public R<Void> submitRenewal(@PathVariable("id") Long id) {
        try {
            return R.result(oaSealRenewalService.submitRenewal(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消印章续期申请")
    @PutMapping("/renewal/cancel/{id}")
    @SaCheckPermission("oa:seal-renewal:cancel")
    public R<Void> cancelRenewal(@PathVariable("id") Long id) {
        try {
            return R.result(oaSealRenewalService.cancelRenewal(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}


