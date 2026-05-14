package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
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

    private final ICrmContactService contactService;

    @GetMapping("/list")
    @SaCheckPermission("crm:contact:list")
    public R<PageResult<CrmContact>> list(CrmContact query, PageQuery pageQuery) {
        return R.ok(contactService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:contact:list")
    public R<CrmContact> getInfo(@PathVariable("id") Long id) {
        CrmContact contact = contactService.getById(id);
        return contact == null || !"0".equals(contact.getDelFlag()) ? R.fail("联系人不存在") : R.ok(contact);
    }

    @SysLog("新增CRM联系人")
    @PostMapping
    @SaCheckPermission("crm:contact:add")
    public R<Void> add(@RequestBody CrmContact contact) {
        try {
            return R.result(contactService.createContact(contact));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM联系人")
    @PutMapping
    @SaCheckPermission("crm:contact:edit")
    public R<Void> edit(@RequestBody CrmContact contact) {
        try {
            return R.result(contactService.updateContact(contact));
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
            contact.setDelFlag("1");
            contactService.updateById(contact);
        }
        return R.ok();
    }
}
