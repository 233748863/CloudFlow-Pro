package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.service.ICrmFollowUpService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/follow-up")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmFollowUpController {

    private final ICrmFollowUpService followUpService;
    private final com.cloudflow.crm.service.ICrmCustomerService customerService;

    @GetMapping("/list")
    @SaCheckPermission("crm:follow-up:list")
    public R<PageResult<CrmFollowUp>> list(CrmFollowUp query, PageQuery pageQuery) {
        return R.ok(followUpService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:follow-up:list")
    public R<CrmFollowUp> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(followUpService.getAccessibleFollowUp(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增CRM跟进")
    @PostMapping
    @SaCheckPermission("crm:follow-up:add")
    public R<Void> add(@RequestBody CrmFollowUp followUp) {
        try {
            return R.result(followUpService.createFollowUp(followUp));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM跟进")
    @PutMapping
    @SaCheckPermission("crm:follow-up:edit")
    public R<Void> edit(@RequestBody CrmFollowUp followUp) {
        try {
            return R.result(followUpService.updateFollowUp(followUp));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM跟进")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:follow-up:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmFollowUp persisted;
            try {
                persisted = followUpService.getAccessibleFollowUp(id);
            } catch (IllegalArgumentException e) {
                return R.fail(e.getMessage());
            }
            CrmFollowUp followUp = new CrmFollowUp();
            followUp.setFollowUpId(id);
            followUp.setDeleted(1);
            followUpService.updateById(followUp);
            customerService.refreshHealth(persisted.getCustomerId());
        }
        return R.ok();
    }
}
