package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysMessageTemplate;
import com.cloudflow.auth.domain.dto.MessageTemplateDTO;
import com.cloudflow.auth.domain.dto.MessageTemplatePreviewDTO;
import com.cloudflow.auth.domain.vo.MyMessageVO;
import com.cloudflow.auth.service.MessageTemplateService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 消息模板管理。
 */
@RestController
@RequestMapping("/system/message/template")
@RequiredArgsConstructor
public class SysMessageTemplateController {
    private final MessageTemplateService service;

    @GetMapping("/list")
    @SaCheckPermission("system:message:template:list")
    public R<PageResult<SysMessageTemplate>> list(@RequestParam(required = false) String templateCode,
                                                  @RequestParam(required = false) String channelType,
                                                  @RequestParam(required = false) String status,
                                                  @RequestParam(defaultValue = "1") Integer pageNum,
                                                  @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(service.list(templateCode, channelType, status, pageNum, pageSize));
    }

    @GetMapping("/{templateId}")
    @SaCheckPermission("system:message:template:list")
    public R<SysMessageTemplate> getInfo(@PathVariable Long templateId) {
        return R.ok(service.get(templateId));
    }

    @SysLog("新增消息模板")
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("system:message:template:add")
    public R<Void> add(@RequestBody @Valid MessageTemplateDTO dto) {
        service.add(dto);
        return R.ok();
    }

    @SysLog("修改消息模板")
    @PutMapping
    @SaCheckPermission("system:message:template:edit")
    public R<Void> edit(@RequestBody @Valid MessageTemplateDTO dto) {
        service.edit(dto);
        return R.ok();
    }

    @SysLog("删除消息模板")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("system:message:template:remove")
    public R<Void> remove(@PathVariable List<Long> ids) {
        service.remove(ids);
        return R.ok();
    }

    @PostMapping("/preview")
    @RepeatSubmit.Disabled
    @SaCheckPermission("system:message:template:list")
    public R<Map<String, String>> preview(@RequestBody MessageTemplatePreviewDTO dto) {
        return R.ok(service.preview(dto));
    }
}
