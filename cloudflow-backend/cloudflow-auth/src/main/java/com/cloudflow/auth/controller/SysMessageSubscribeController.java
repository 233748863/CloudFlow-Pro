package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.dto.SubscribeDTO;
import com.cloudflow.auth.domain.vo.SubscribeVO;
import com.cloudflow.auth.service.MessageSubscribeService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 当前用户消息订阅设置。
 */
@RestController
@RequestMapping("/system/message/subscribe")
@RequiredArgsConstructor
public class SysMessageSubscribeController {
    private final MessageSubscribeService service;

    @GetMapping("/mine")
    @SaCheckPermission("system:message:subscribe:list")
    public R<List<SubscribeVO>> mySubscribe() {
        return R.ok(service.mine());
    }

    @SysLog("保存消息订阅设置")
    @PutMapping("/mine")
    @SaCheckPermission("system:message:subscribe:edit")
    public R<Void> saveMySubscribe(@RequestBody List<SubscribeDTO> list) {
        service.saveMine(list);
        return R.ok();
    }
}
