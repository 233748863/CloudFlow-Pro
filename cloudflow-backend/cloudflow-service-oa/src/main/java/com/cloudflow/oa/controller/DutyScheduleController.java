package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.DutySchedule;
import com.cloudflow.oa.domain.dto.DutySwapDTO;
import com.cloudflow.oa.service.IDutyScheduleService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 值班排班 Controller
 * 前端请求路径：/oa/duty/xxx → 网关 StripPrefix=1 → /duty/xxx
 */
@RestController
@RequestMapping("/duty")
@RequiredArgsConstructor
@SaCheckLogin
public class DutyScheduleController {

    private final IDutyScheduleService dutyScheduleService;

    /** 分页查询值班排班列表 */
    @GetMapping("/list")
    @SaCheckPermission("admin:duty:list")
    public R list(DutySchedule query,
                  @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                  @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
        IPage<DutySchedule> page = dutyScheduleService.queryPage(query, pageNum, pageSize);
        return R.ok(page);
    }

    /** 按月查询值班列表（日历视图） */
    @GetMapping("/calendar")
    @SaCheckPermission("admin:duty:list")
    public R calendar(@RequestParam("year") int year,
                      @RequestParam("month") int month,
                      @RequestParam(value = "deptId", required = false) Long deptId) {
        List<DutySchedule> list = dutyScheduleService.listByMonth(year, month, deptId);
        return R.ok(list);
    }

    /** 获取详情 */
    @GetMapping("/{id}")
    @SaCheckPermission("admin:duty:list")
    public R getInfo(@PathVariable("id") Long id) {
        DutySchedule schedule = dutyScheduleService.getById(id);
        return schedule != null ? R.ok(schedule) : R.fail("值班排班不存在");
    }

    /** 新增排班 - 仅管理员/经理 */
    @SysLog("新增值班排班")
    @PostMapping
    @SaCheckPermission("admin:duty:add")
    public R add(@RequestBody DutySchedule schedule) {
        // 填充当前登录用户信息作为创建者
        schedule.setCreateBy(UserContext.getUserName());
        schedule.setStatus("SCHEDULED");
        return R.result(dutyScheduleService.save(schedule));
    }

    /** 批量新增排班 - 仅管理员/经理 */
    @SysLog("批量新增值班排班")
    @PostMapping("/batch")
    @SaCheckPermission("admin:duty:add")
    public R addBatch(@RequestBody List<DutySchedule> schedules) {
        String currentUser = UserContext.getUserName();
        schedules.forEach(s -> {
            s.setCreateBy(currentUser);
            s.setStatus("SCHEDULED");
        });
        return R.result(dutyScheduleService.saveBatch(schedules));
    }

    /** 修改排班 - 仅管理员/经理 */
    @SysLog("修改值班排班")
    @PutMapping
    @SaCheckPermission("admin:duty:edit")
    public R edit(@RequestBody DutySchedule schedule) {
        if (schedule.getScheduleId() == null) {
            return R.fail("排班ID不能为空");
        }
        return R.result(dutyScheduleService.updateById(schedule));
    }

    /** 删除排班 - 仅管理员/经理 */
    @SysLog("删除值班排班")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("admin:duty:remove")
    public R remove(@PathVariable("ids") List<Long> ids) {
        return R.result(dutyScheduleService.removeBatchByIds(ids));
    }

    /** 值班签到 */
    @SysLog("值班签到")
    @PutMapping("/checkin/{id}")
    @SaCheckPermission("admin:duty:checkin")
    public R checkIn(@PathVariable("id") Long id) {
        return R.result(dutyScheduleService.checkIn(id));
    }

    /** 值班签退 */
    @SysLog("值班签退")
    @PutMapping("/checkout/{id}")
    @SaCheckPermission("admin:duty:checkout")
    public R checkOut(@PathVariable("id") Long id) {
        return R.result(dutyScheduleService.checkOut(id));
    }

    /** 换班申请 */
    @SysLog("换班申请")
    @PutMapping("/swap/{id}")
    @SaCheckPermission("admin:duty:swap")
    public R swap(@PathVariable("id") Long id, @RequestBody DutySwapDTO dto) {
        return R.result(dutyScheduleService.swapDuty(id, dto.getBackupUserId(), dto.getBackupUserName(), dto.getReason()));
    }
}
