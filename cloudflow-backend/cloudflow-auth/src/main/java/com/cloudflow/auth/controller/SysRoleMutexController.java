package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysRoleMutex;
import com.cloudflow.auth.domain.dto.RoleMutexRequest;
import com.cloudflow.auth.service.RoleMutexService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/system/role/mutex")
@RequiredArgsConstructor
public class SysRoleMutexController {

    private final RoleMutexService roleMutexService;

    @GetMapping("/list")
    @SaCheckPermission("system:role:list")
    public R<List<SysRoleMutex>> list() {
        return R.ok(roleMutexService.listRules());
    }

    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("system:role:edit")
    public R<Long> add(@RequestBody RoleMutexRequest request) {
        return R.ok(roleMutexService.addRule(request));
    }

    @DeleteMapping("/{id}")
    @SaCheckPermission("system:role:edit")
    public R<Integer> remove(@PathVariable Long id) {
        return R.ok(roleMutexService.removeRule(id));
    }
}
