package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.excel.utils.ExcelUtil;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OvertimeRequest;
import com.cloudflow.oa.domain.export.OvertimeRequestExportVo;
import com.cloudflow.oa.service.IOvertimeRequestService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 加班申请 Controller
 * 前端请求路径：/oa/overtime/xxx → 网关 StripPrefix=1 → /overtime/xxx
 */
@RestController
@RequestMapping("/overtime")
@RequiredArgsConstructor
public class OvertimeController {

    private final IOvertimeRequestService overtimeRequestService;

    /** 分页查询加班申请列表 */
    @GetMapping("/list")
    public R list(OvertimeRequest query,
                  @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                  @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
        IPage<OvertimeRequest> page = overtimeRequestService.queryPage(query, pageNum, pageSize);
        return R.ok(page);
    }

    /**
     * 导出加班申请列表
     */
    @SysLog("导出加班申请")
    @GetMapping("/export")
    public void export(OvertimeRequest query, HttpServletResponse response) {
        // 复用现有筛选与数据权限逻辑，保证导出结果和列表一致。
        List<OvertimeRequestExportVo> rows = overtimeRequestService.queryPage(query, 1, Integer.MAX_VALUE)
                .getRecords()
                .stream()
                .map(OvertimeRequestExportVo::from)
                .toList();
        ExcelUtil.exportExcel(rows, "加班申请", OvertimeRequestExportVo.class, response);
    }

    /** 获取详情 */
    @GetMapping("/{id}")
    public R getInfo(@PathVariable("id") Long id) {
        OvertimeRequest overtime = overtimeRequestService.getById(id);
        return overtime != null ? R.ok(overtime) : R.fail("加班申请不存在");
    }

    /** 新增（草稿） */
    @SysLog("新增加班申请")
    @PostMapping
    public R add(@RequestBody OvertimeRequest overtime) {
        return R.result(overtimeRequestService.createOvertime(overtime));
    }

    /** 修改 */
    @SysLog("修改加班申请")
    @PutMapping
    public R edit(@RequestBody OvertimeRequest overtime) {
        if (overtime.getId() == null) {
            return R.fail("ID不能为空");
        }
        return R.result(overtimeRequestService.updateById(overtime));
    }

    /** 删除 */
    @SysLog("删除加班申请")
    @DeleteMapping("/{ids}")
    public R remove(@PathVariable("ids") List<Long> ids) {
        return R.result(overtimeRequestService.removeBatchByIds(ids));
    }

    /** 提交审批 */
    @SysLog("提交加班申请")
    @PostMapping("/submit/{id}")
    public R submit(@PathVariable("id") Long id) {
        return R.result(overtimeRequestService.submitOvertime(id));
    }

    /** 取消 */
    @SysLog("取消加班申请")
    @PutMapping("/cancel/{id}")
    public R cancel(@PathVariable("id") Long id) {
        return R.result(overtimeRequestService.cancelOvertime(id));
    }
}
