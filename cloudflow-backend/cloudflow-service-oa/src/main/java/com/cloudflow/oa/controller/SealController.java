package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
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
@SaCheckLogin
public class SealController {

    private final IOaSealService sealService;
    private final IOaSealApplicationService applicationService;
    private final IOaSealRenewalService renewalService;

    @GetMapping("/list")
    @SaCheckPermission("admin:seal:list")
    public R<PageResult<OaSeal>> list(OaSeal query, PageQuery pageQuery) {
        return R.ok(sealService.queryPage(query, pageQuery));
    }

    @GetMapping("/available")
    @SaCheckPermission(value = {"admin:seal:list", "office:seal:list"}, mode = SaMode.OR)
    public R<List<OaSeal>> listAvailable() {
        return R.ok(sealService.listAvailable());
    }

    @GetMapping("/expiring")
    @SaCheckPermission("admin:seal:list")
    public R<PageResult<OaSeal>> listExpiring(@RequestParam(value = "days", required = false) Integer days,
                                              PageQuery pageQuery) {
        return R.ok(sealService.queryExpiringPage(days, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("admin:seal:list")
    public R<OaSeal> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(sealService.getSealInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增印章")
    @PostMapping
    @SaCheckPermission("admin:seal:add")
    public R<Void> add(@RequestBody OaSeal seal) {
        try {
            return R.result(sealService.createSeal(seal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改印章")
    @PutMapping
    @SaCheckPermission("admin:seal:edit")
    public R<Void> edit(@RequestBody OaSeal seal) {
        try {
            return R.result(sealService.updateSeal(seal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除印章")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("admin:seal:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(sealService.removeSeals(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/expiry-reminder-logs")
    @SaCheckPermission("admin:seal:list")
    public R<List<OaSealExpiryReminderLog>> listExpiryReminderLogs(@PathVariable("id") Long id) {
        return R.ok(sealService.listExpiryReminderLogs(id));
    }

    @SysLog("印章到期提醒")
    @PostMapping("/{id}/expiry-remind")
    @SaCheckPermission("admin:seal:remind")
    public R<Void> remindExpiry(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(sealService.remindExpiry(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/application/list")
    @SaCheckPermission("office:seal:list")
    public R<PageResult<OaSealApplication>> listApplications(OaSealApplication query, PageQuery pageQuery) {
        return R.ok(applicationService.queryPage(query, pageQuery));
    }

    @GetMapping("/application/overdue")
    @SaCheckPermission("office:seal:list")
    public R<PageResult<OaSealApplication>> listOverdue(PageQuery pageQuery) {
        return R.ok(applicationService.queryOverduePage(pageQuery));
    }

    @GetMapping("/application/{id}")
    @SaCheckPermission("office:seal:list")
    public R<OaSealApplication> getApplication(@PathVariable("id") Long id) {
        try {
            return R.ok(applicationService.getApplicationInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/application/{id}/handover-logs")
    @SaCheckPermission("office:seal:list")
    public R<List<OaSealHandoverLog>> listHandoverLogs(@PathVariable("id") Long id) {
        return R.ok(applicationService.listHandoverLogs(id));
    }

    @GetMapping("/application/{id}/reminder-logs")
    @SaCheckPermission("office:seal:list")
    public R<List<OaBorrowReminderLog>> listReminderLogs(@PathVariable("id") Long id) {
        return R.ok(applicationService.listReminderLogs(id));
    }

    @SysLog("新增用印申请")
    @PostMapping("/application")
    @SaCheckPermission("office:seal:add")
    public R<Void> addApplication(@RequestBody OaSealApplication application) {
        try {
            return R.result(applicationService.createApplication(application));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改用印申请")
    @PutMapping("/application")
    @SaCheckPermission("office:seal:edit")
    public R<Void> editApplication(@RequestBody OaSealApplication application) {
        try {
            return R.result(applicationService.updateApplication(application));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除用印申请")
    @DeleteMapping("/application/{ids}")
    @SaCheckPermission("office:seal:remove")
    public R<Void> removeApplications(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(applicationService.removeApplications(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交用印申请")
    @PostMapping("/application/submit/{id}")
    @SaCheckPermission("office:seal:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(applicationService.submitApplication(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消用印申请")
    @PutMapping("/application/cancel/{id}")
    @SaCheckPermission("office:seal:cancel")
    public R<Void> cancel(@PathVariable("id") Long id) {
        try {
            return R.result(applicationService.cancelApplication(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认借出印章")
    @PutMapping("/application/{id}/borrow")
    @SaCheckPermission("admin:borrow:confirm")
    public R<Void> confirmBorrow(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(applicationService.confirmBorrow(id,
                    dto == null ? null : dto.getRemark(),
                    dto == null ? null : dto.getAttachmentUrl()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认归还印章")
    @PutMapping("/application/{id}/return")
    @SaCheckPermission("admin:borrow:return")
    public R<Void> confirmReturn(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(applicationService.confirmReturn(id,
                    dto == null ? null : dto.getRemark(),
                    dto == null ? null : dto.getAttachmentUrl()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("催还印章")
    @PostMapping("/application/{id}/remind")
    @SaCheckPermission("admin:borrow:remind")
    public R<Void> remind(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(applicationService.remind(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/renewal/list")
    @SaCheckPermission("admin:seal:list")
    public R<PageResult<OaSealRenewal>> listRenewals(OaSealRenewal query, PageQuery pageQuery) {
        return R.ok(renewalService.queryPage(query, pageQuery));
    }

    @GetMapping("/renewal/{id}")
    @SaCheckPermission("admin:seal:list")
    public R<OaSealRenewal> getRenewal(@PathVariable("id") Long id) {
        try {
            return R.ok(renewalService.getRenewalInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增印章续期申请")
    @PostMapping("/renewal")
    @SaCheckPermission("admin:seal-renewal:add")
    public R<Void> addRenewal(@RequestBody OaSealRenewal renewal) {
        try {
            return R.result(renewalService.createRenewal(renewal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改印章续期申请")
    @PutMapping("/renewal")
    @SaCheckPermission("admin:seal-renewal:edit")
    public R<Void> editRenewal(@RequestBody OaSealRenewal renewal) {
        try {
            return R.result(renewalService.updateRenewal(renewal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除印章续期申请")
    @DeleteMapping("/renewal/{ids}")
    @SaCheckPermission("admin:seal-renewal:remove")
    public R<Void> removeRenewals(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(renewalService.removeRenewals(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交印章续期申请")
    @PostMapping("/renewal/submit/{id}")
    @SaCheckPermission("admin:seal-renewal:submit")
    public R<Void> submitRenewal(@PathVariable("id") Long id) {
        try {
            return R.result(renewalService.submitRenewal(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消印章续期申请")
    @PutMapping("/renewal/cancel/{id}")
    @SaCheckPermission("admin:seal-renewal:cancel")
    public R<Void> cancelRenewal(@PathVariable("id") Long id) {
        try {
            return R.result(renewalService.cancelRenewal(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}
