package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.LeaveRequest;
import com.cloudflow.oa.service.ILeaveRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 请假管理 Controller
 * 前端请求路径：/oa/leave/xxx → 网关 StripPrefix=1 → /leave/xxx
 */
@RestController
@RequestMapping("/leave")
@RequiredArgsConstructor
public class LeaveController {

    private final ILeaveRequestService leaveRequestService;

    /**
     * 分页查询请假申请列表
     */
    @GetMapping("/list")
    public R list(LeaveRequest query,
                  @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                  @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
        IPage<LeaveRequest> page = leaveRequestService.queryPage(query, pageNum, pageSize);
        return R.ok(page);
    }

    /**
     * 获取请假申请详情
     */
    @GetMapping("/{id}")
    public R getInfo(@PathVariable("id") Long id) {
        LeaveRequest leave = leaveRequestService.getById(id);
        if (leave == null) {
            return R.fail("请假申请不存在");
        }
        return R.ok(leave);
    }

    /**
     * 新增请假申请（草稿）
     */
    @PostMapping
    public R add(@RequestBody LeaveRequest leave) {
        return R.result(leaveRequestService.createLeave(leave));
    }

    /**
     * 修改请假申请
     */
    @PutMapping
    public R edit(@RequestBody LeaveRequest leave) {
        if (leave.getId() == null) {
            return R.fail("请假申请ID不能为空");
        }
        return R.result(leaveRequestService.updateById(leave));
    }

    /**
     * 删除请假申请（逻辑删除）
     */
    @DeleteMapping("/{ids}")
    public R remove(@PathVariable("ids") List<Long> ids) {
        return R.result(leaveRequestService.removeBatchByIds(ids));
    }

    /**
     * 提交请假申请（启动工作流审批）
     */
    @PostMapping("/submit/{id}")
    public R submit(@PathVariable("id") Long id) {
        return R.result(leaveRequestService.submitLeave(id));
    }

    /**
     * 取消请假申请
     */
    @PutMapping("/cancel/{id}")
    public R cancel(@PathVariable("id") Long id) {
        return R.result(leaveRequestService.cancelLeave(id));
    }
}
