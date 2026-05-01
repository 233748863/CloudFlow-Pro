package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaLicenseHandoverLog;
import com.cloudflow.oa.domain.dto.OaBorrowActionDTO;
import com.cloudflow.oa.service.IOaLicenseBorrowService;
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

    private final IOaLicenseService licenseService;
    private final IOaLicenseBorrowService borrowService;

    @GetMapping("/list")
    public R<PageResult<OaLicense>> list(OaLicense query, PageQuery pageQuery) {
        return R.ok(licenseService.queryPage(query, pageQuery));
    }

    @GetMapping("/available")
    public R<List<OaLicense>> listAvailable() {
        return R.ok(licenseService.listAvailable());
    }

    @GetMapping("/{id}")
    public R<OaLicense> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(licenseService.getLicenseInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增证照")
    @PostMapping
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> add(@RequestBody OaLicense license) {
        try {
            return R.result(licenseService.createLicense(license));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改证照")
    @PutMapping
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> edit(@RequestBody OaLicense license) {
        try {
            return R.result(licenseService.updateLicense(license));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除证照")
    @DeleteMapping("/{ids}")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(licenseService.removeLicenses(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/borrow/list")
    public R<PageResult<OaLicenseBorrow>> listBorrows(OaLicenseBorrow query, PageQuery pageQuery) {
        return R.ok(borrowService.queryPage(query, pageQuery));
    }

    @GetMapping("/borrow/overdue")
    public R<PageResult<OaLicenseBorrow>> listOverdue(PageQuery pageQuery) {
        return R.ok(borrowService.queryOverduePage(pageQuery));
    }

    @GetMapping("/borrow/{id}")
    public R<OaLicenseBorrow> getBorrow(@PathVariable("id") Long id) {
        try {
            return R.ok(borrowService.getBorrowInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/borrow/{id}/handover-logs")
    public R<List<OaLicenseHandoverLog>> listHandoverLogs(@PathVariable("id") Long id) {
        return R.ok(borrowService.listHandoverLogs(id));
    }

    @GetMapping("/borrow/{id}/reminder-logs")
    public R<List<OaBorrowReminderLog>> listReminderLogs(@PathVariable("id") Long id) {
        return R.ok(borrowService.listReminderLogs(id));
    }

    @SysLog("新增证照借用申请")
    @PostMapping("/borrow")
    public R<Void> addBorrow(@RequestBody OaLicenseBorrow borrow) {
        try {
            return R.result(borrowService.createBorrow(borrow));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改证照借用申请")
    @PutMapping("/borrow")
    public R<Void> editBorrow(@RequestBody OaLicenseBorrow borrow) {
        try {
            return R.result(borrowService.updateBorrow(borrow));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除证照借用申请")
    @DeleteMapping("/borrow/{ids}")
    public R<Void> removeBorrows(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(borrowService.removeBorrows(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交证照借用申请")
    @PostMapping("/borrow/submit/{id}")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(borrowService.submitBorrow(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消证照借用申请")
    @PutMapping("/borrow/cancel/{id}")
    public R<Void> cancel(@PathVariable("id") Long id) {
        try {
            return R.result(borrowService.cancelBorrow(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认借出证照")
    @PutMapping("/borrow/{id}/borrow")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> confirmBorrow(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(borrowService.confirmBorrow(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认归还证照")
    @PutMapping("/borrow/{id}/return")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> confirmReturn(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(borrowService.confirmReturn(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("催还证照")
    @PostMapping("/borrow/{id}/remind")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> remind(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(borrowService.remind(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}
