package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaLicenseExpiryReminderLog;
import com.cloudflow.oa.domain.OaLicenseHandoverLog;
import com.cloudflow.oa.domain.OaLicenseRenewal;
import com.cloudflow.oa.domain.dto.OaBorrowActionDTO;
import com.cloudflow.oa.service.IOaLicenseBorrowService;
import com.cloudflow.oa.service.IOaLicenseRenewalService;
import com.cloudflow.oa.service.IOaLicenseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 证照借用 Controller。
 */
@RestController
@RequestMapping("/license")
@RequiredArgsConstructor
public class LicenseController {

    private final IOaLicenseService oaLicenseService;
    private final IOaLicenseBorrowService oaLicenseBorrowService;
    private final IOaLicenseRenewalService oaLicenseRenewalService;

    @GetMapping("/list")
    @SaCheckPermission("oa:license:list")
    public R<PageResult<OaLicense>> list(OaLicense query, PageQuery pageQuery) {
        return R.ok(oaLicenseService.queryPage(query, pageQuery));
    }

    @GetMapping("/available")
    @SaCheckPermission(value = {"oa:license:list", "oa:license:list"}, mode = SaMode.OR)
    public R<List<OaLicense>> listAvailable() {
        return R.ok(oaLicenseService.listAvailable());
    }

    @GetMapping("/expiring")
    @SaCheckPermission("oa:license:list")
    public R<PageResult<OaLicense>> listExpiring(@RequestParam(value = "days", required = false) Integer days,
                                                 PageQuery pageQuery) {
        return R.ok(oaLicenseService.queryExpiringPage(days, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:license:list")
    public R<OaLicense> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(oaLicenseService.getLicenseInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增证照")
    @PostMapping
    @SaCheckPermission("oa:license:add")
    public R<Void> add(@RequestBody OaLicense license) {
        try {
            return R.result(oaLicenseService.createLicense(license));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改证照")
    @PutMapping
    @SaCheckPermission("oa:license:edit")
    public R<Void> edit(@RequestBody OaLicense license) {
        try {
            return R.result(oaLicenseService.updateLicense(license));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除证照")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:license:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(oaLicenseService.removeLicenses(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/expiry-reminder-logs")
    @SaCheckPermission("oa:license:list")
    public R<List<OaLicenseExpiryReminderLog>> listExpiryReminderLogs(@PathVariable("id") Long id) {
        return R.ok(oaLicenseService.listExpiryReminderLogs(id));
    }

    @SysLog("证照到期提醒")
    @PostMapping("/{id}/expiry-remind")
    @SaCheckPermission("oa:license:remind")
    public R<Void> remindExpiry(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(oaLicenseService.remindExpiry(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/borrow/list")
    @SaCheckPermission("oa:license:list")
    public R<PageResult<OaLicenseBorrow>> listBorrows(OaLicenseBorrow query, PageQuery pageQuery) {
        return R.ok(oaLicenseBorrowService.queryPage(query, pageQuery));
    }

    @GetMapping("/borrow/overdue")
    @SaCheckPermission("oa:license:list")
    public R<PageResult<OaLicenseBorrow>> listOverdue(PageQuery pageQuery) {
        return R.ok(oaLicenseBorrowService.queryOverduePage(pageQuery));
    }

    @GetMapping("/borrow/{id}")
    @SaCheckPermission("oa:license:list")
    public R<OaLicenseBorrow> getBorrow(@PathVariable("id") Long id) {
        try {
            return R.ok(oaLicenseBorrowService.getBorrowInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/borrow/{id}/handover-logs")
    @SaCheckPermission("oa:license:list")
    public R<List<OaLicenseHandoverLog>> listHandoverLogs(@PathVariable("id") Long id) {
        return R.ok(oaLicenseBorrowService.listHandoverLogs(id));
    }

    @GetMapping("/borrow/{id}/reminder-logs")
    @SaCheckPermission("oa:license:list")
    public R<List<OaBorrowReminderLog>> listReminderLogs(@PathVariable("id") Long id) {
        return R.ok(oaLicenseBorrowService.listReminderLogs(id));
    }

    @SysLog("新增证照借用申请")
    @PostMapping("/borrow")
    @SaCheckPermission("oa:license:add")
    public R<Void> addBorrow(@RequestBody OaLicenseBorrow borrow) {
        try {
            return R.result(oaLicenseBorrowService.createBorrow(borrow));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改证照借用申请")
    @PutMapping("/borrow")
    @SaCheckPermission("oa:license:edit")
    public R<Void> editBorrow(@RequestBody OaLicenseBorrow borrow) {
        try {
            return R.result(oaLicenseBorrowService.updateBorrow(borrow));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除证照借用申请")
    @DeleteMapping("/borrow/{ids}")
    @SaCheckPermission("oa:license:remove")
    public R<Void> removeBorrows(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(oaLicenseBorrowService.removeBorrows(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交证照借用申请")
    @PostMapping("/borrow/submit/{id}")
    @SaCheckPermission("oa:license:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(oaLicenseBorrowService.submitBorrow(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消证照借用申请")
    @PutMapping("/borrow/cancel/{id}")
    @SaCheckPermission("oa:license:cancel")
    public R<Void> cancel(@PathVariable("id") Long id) {
        try {
            return R.result(oaLicenseBorrowService.cancelBorrow(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认借出证照")
    @PutMapping("/borrow/{id}/borrow")
    @SaCheckPermission("oa:borrow:confirm")
    public R<Void> confirmBorrow(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(oaLicenseBorrowService.confirmBorrow(id,
                    dto == null ? null : dto.getRemark(),
                    dto == null ? null : dto.getAttachmentUrl()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认归还证照")
    @PutMapping("/borrow/{id}/return")
    @SaCheckPermission("oa:borrow:return")
    public R<Void> confirmReturn(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(oaLicenseBorrowService.confirmReturn(id,
                    dto == null ? null : dto.getRemark(),
                    dto == null ? null : dto.getAttachmentUrl()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("催还证照")
    @PostMapping("/borrow/{id}/remind")
    @SaCheckPermission("oa:borrow:remind")
    public R<Void> remind(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(oaLicenseBorrowService.remind(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/renewal/list")
    @SaCheckPermission("oa:license:list")
    public R<PageResult<OaLicenseRenewal>> listRenewals(OaLicenseRenewal query, PageQuery pageQuery) {
        return R.ok(oaLicenseRenewalService.queryPage(query, pageQuery));
    }

    @GetMapping("/renewal/{id}")
    @SaCheckPermission("oa:license:list")
    public R<OaLicenseRenewal> getRenewal(@PathVariable("id") Long id) {
        try {
            return R.ok(oaLicenseRenewalService.getRenewalInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增证照续期申请")
    @PostMapping("/renewal")
    @SaCheckPermission("oa:license-renewal:add")
    public R<Void> addRenewal(@RequestBody OaLicenseRenewal renewal) {
        try {
            return R.result(oaLicenseRenewalService.createRenewal(renewal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改证照续期申请")
    @PutMapping("/renewal")
    @SaCheckPermission("oa:license-renewal:edit")
    public R<Void> editRenewal(@RequestBody OaLicenseRenewal renewal) {
        try {
            return R.result(oaLicenseRenewalService.updateRenewal(renewal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除证照续期申请")
    @DeleteMapping("/renewal/{ids}")
    @SaCheckPermission("oa:license-renewal:remove")
    public R<Void> removeRenewals(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(oaLicenseRenewalService.removeRenewals(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交证照续期申请")
    @PostMapping("/renewal/submit/{id}")
    @SaCheckPermission("oa:license-renewal:submit")
    public R<Void> submitRenewal(@PathVariable("id") Long id) {
        try {
            return R.result(oaLicenseRenewalService.submitRenewal(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消证照续期申请")
    @PutMapping("/renewal/cancel/{id}")
    @SaCheckPermission("oa:license-renewal:cancel")
    public R<Void> cancelRenewal(@PathVariable("id") Long id) {
        try {
            return R.result(oaLicenseRenewalService.cancelRenewal(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}


