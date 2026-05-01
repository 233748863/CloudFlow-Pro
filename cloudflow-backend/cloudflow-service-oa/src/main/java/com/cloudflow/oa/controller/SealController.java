package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.OaSealHandoverLog;
import com.cloudflow.oa.domain.dto.OaBorrowActionDTO;
import com.cloudflow.oa.service.IOaSealApplicationService;
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

    private final IOaSealService sealService;
    private final IOaSealApplicationService applicationService;

    @GetMapping("/list")
    public R<PageResult<OaSeal>> list(OaSeal query, PageQuery pageQuery) {
        return R.ok(sealService.queryPage(query, pageQuery));
    }

    @GetMapping("/available")
    public R<List<OaSeal>> listAvailable() {
        return R.ok(sealService.listAvailable());
    }

    @GetMapping("/{id}")
    public R<OaSeal> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(sealService.getSealInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增印章")
    @PostMapping
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> add(@RequestBody OaSeal seal) {
        try {
            return R.result(sealService.createSeal(seal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改印章")
    @PutMapping
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> edit(@RequestBody OaSeal seal) {
        try {
            return R.result(sealService.updateSeal(seal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除印章")
    @DeleteMapping("/{ids}")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(sealService.removeSeals(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/application/list")
    public R<PageResult<OaSealApplication>> listApplications(OaSealApplication query, PageQuery pageQuery) {
        return R.ok(applicationService.queryPage(query, pageQuery));
    }

    @GetMapping("/application/overdue")
    public R<PageResult<OaSealApplication>> listOverdue(PageQuery pageQuery) {
        return R.ok(applicationService.queryOverduePage(pageQuery));
    }

    @GetMapping("/application/{id}")
    public R<OaSealApplication> getApplication(@PathVariable("id") Long id) {
        try {
            return R.ok(applicationService.getApplicationInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/application/{id}/handover-logs")
    public R<List<OaSealHandoverLog>> listHandoverLogs(@PathVariable("id") Long id) {
        return R.ok(applicationService.listHandoverLogs(id));
    }

    @GetMapping("/application/{id}/reminder-logs")
    public R<List<OaBorrowReminderLog>> listReminderLogs(@PathVariable("id") Long id) {
        return R.ok(applicationService.listReminderLogs(id));
    }

    @SysLog("新增用印申请")
    @PostMapping("/application")
    public R<Void> addApplication(@RequestBody OaSealApplication application) {
        try {
            return R.result(applicationService.createApplication(application));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改用印申请")
    @PutMapping("/application")
    public R<Void> editApplication(@RequestBody OaSealApplication application) {
        try {
            return R.result(applicationService.updateApplication(application));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除用印申请")
    @DeleteMapping("/application/{ids}")
    public R<Void> removeApplications(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(applicationService.removeApplications(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交用印申请")
    @PostMapping("/application/submit/{id}")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(applicationService.submitApplication(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消用印申请")
    @PutMapping("/application/cancel/{id}")
    public R<Void> cancel(@PathVariable("id") Long id) {
        try {
            return R.result(applicationService.cancelApplication(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认借出印章")
    @PutMapping("/application/{id}/borrow")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
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
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
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
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> remind(@PathVariable("id") Long id, @RequestBody(required = false) OaBorrowActionDTO dto) {
        try {
            return R.result(applicationService.remind(id, dto == null ? null : dto.getRemark()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}
