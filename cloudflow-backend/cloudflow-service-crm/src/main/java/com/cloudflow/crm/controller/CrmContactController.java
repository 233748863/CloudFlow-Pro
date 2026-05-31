package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.service.ICrmContactService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/contact")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmContactController {

    private final ICrmContactService crmContactService;

    @GetMapping("/list")
    @SaCheckPermission("crm:contact:list")
    public R<PageResult<CrmContact>> list(CrmContact query, PageQuery pageQuery) {
        return R.ok(crmContactService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:contact:list")
    public R<CrmContact> getInfo(@PathVariable("id") Long id) {
        CrmContact contact = crmContactService.getById(id);
        return contact == null || !Integer.valueOf(0).equals(contact.getDeleted()) ? R.fail("联系人不存在") : R.ok(contact);
    }

    @SysLog("新增CRM联系人")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("crm:contact:add")
    public R<Void> add(@RequestBody CrmContact contact) {
        try {
            return R.result(crmContactService.createContact(contact));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM联系人")
    @PutMapping
    @SaCheckPermission("crm:contact:edit")
    public R<Void> edit(@RequestBody CrmContact contact) {
        try {
            return R.result(crmContactService.updateContact(contact));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM联系人")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:contact:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmContact contact = new CrmContact();
            contact.setContactId(id);
            contact.setDeleted(1);
            crmContactService.updateById(contact);
        }
        return R.ok();
    }
}
