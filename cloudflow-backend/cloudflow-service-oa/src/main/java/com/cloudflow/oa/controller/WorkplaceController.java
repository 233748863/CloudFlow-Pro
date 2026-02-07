package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;
import com.cloudflow.oa.domain.dto.RecentTaskDTO;
import com.cloudflow.oa.service.IWorkplaceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 工作台控制器
 * 提供工作台概览和最近任务等聚合数据
 */
@RestController
@RequestMapping("/workflow/workplace")
public class WorkplaceController {

    @Autowired
    private IWorkplaceService workplaceService;

    /**
     * 获取工作台概览
     * 聚合数据：待办任务数量、今日日程数量、未读消息数量
     */
    @GetMapping("/summary")
    public R<WorkplaceSummaryDTO> getSummary() {
        Long userId = UserContext.getUserId();
        return R.ok(workplaceService.getWorkplaceSummary(userId));
    }

    /**
     * 获取最近任务
     * 返回用户最近操作的任务列表
     */
    @GetMapping("/recent-tasks")
    public R<List<RecentTaskDTO>> getRecentTasks(@RequestParam(defaultValue = "10") Integer limit) {
        Long userId = UserContext.getUserId();
        return R.ok(workplaceService.getRecentTasks(userId, limit));
    }
}
