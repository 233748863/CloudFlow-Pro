package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.dto.HotUpdateRequest;
import com.cloudflow.workflow.domain.dto.HotUpdateResult;
import com.cloudflow.workflow.domain.entity.WfHotUpdateRecord;
import com.cloudflow.workflow.service.IHotUpdateService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;

import java.util.List;

@RestController
@RequestMapping("/hot-update")
public class HotUpdateController {

    @Autowired
    private IHotUpdateService hotUpdateService;

    @PostMapping("/analyze")
    @SaCheckPermission("workflow:definition:view")
    public R<HotUpdateResult> analyze(@RequestBody HotUpdateRequest request) {
        request.setDryRun(true);
        return R.ok(hotUpdateService.analyzeOrExecute(request));
    }

    @PostMapping("/execute")
    @SaCheckRole("admin")
    public R<HotUpdateResult> execute(@RequestBody HotUpdateRequest request) {
        request.setDryRun(false);
        return R.ok(hotUpdateService.analyzeOrExecute(request));
    }

    @GetMapping("/history")
    @SaCheckPermission("workflow:definition:view")
    public R<List<WfHotUpdateRecord>> history(@RequestParam String processKey) {
        return R.ok(hotUpdateService.getHistory(processKey));
    }
}
