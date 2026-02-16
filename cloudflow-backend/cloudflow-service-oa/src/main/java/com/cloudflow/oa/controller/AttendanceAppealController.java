package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.AttendanceAppeal;
import com.cloudflow.oa.service.IAttendanceAppealService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 补卡/外勤申请 Controller
 * 前端请求路径：/oa/attendance/appeal/xxx → 网关 StripPrefix=1 → /attendance/appeal/xxx
 */
@RestController
@RequestMapping("/attendance/appeal")
@RequiredArgsConstructor
public class AttendanceAppealController {

    private final IAttendanceAppealService attendanceAppealService;

    /** 分页查询补卡/外勤申请列表 */
    @GetMapping("/list")
    public R list(AttendanceAppeal query,
                  @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                  @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
        IPage<AttendanceAppeal> page = attendanceAppealService.queryPage(query, pageNum, pageSize);
        return R.ok(page);
    }

    /** 获取详情 */
    @GetMapping("/{id}")
    public R getInfo(@PathVariable("id") Long id) {
        AttendanceAppeal appeal = attendanceAppealService.getById(id);
        return appeal != null ? R.ok(appeal) : R.fail("申请不存在");
    }

    /** 新增（草稿） */
    @SysLog("新增补卡/外勤申请")
    @PostMapping
    public R add(@RequestBody AttendanceAppeal appeal) {
        return R.result(attendanceAppealService.createAppeal(appeal));
    }

    /** 修改 */
    @SysLog("修改补卡/外勤申请")
    @PutMapping
    public R edit(@RequestBody AttendanceAppeal appeal) {
        if (appeal.getId() == null) {
            return R.fail("ID不能为空");
        }
        return R.result(attendanceAppealService.updateById(appeal));
    }

    /** 删除 */
    @SysLog("删除补卡/外勤申请")
    @DeleteMapping("/{ids}")
    public R remove(@PathVariable("ids") List<Long> ids) {
        return R.result(attendanceAppealService.removeBatchByIds(ids));
    }

    /** 提交审批 */
    @SysLog("提交补卡/外勤申请")
    @PostMapping("/submit/{id}")
    public R submit(@PathVariable("id") Long id) {
        return R.result(attendanceAppealService.submitAppeal(id));
    }

    /** 取消 */
    @SysLog("取消补卡/外勤申请")
    @PutMapping("/cancel/{id}")
    public R cancel(@PathVariable("id") Long id) {
        return R.result(attendanceAppealService.cancelAppeal(id));
    }
}
