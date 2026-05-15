package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.excel.utils.ExcelUtil;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.domain.export.BusinessTripExportVo;
import com.cloudflow.oa.service.IBusinessTripService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 出差申请 Controller
 * 前端请求路径：/oa/business-trip/xxx → 网关 StripPrefix=1 → /business-trip/xxx
 */
@RestController
@RequestMapping("/business-trip")
@RequiredArgsConstructor
public class BusinessTripController {

    private final IBusinessTripService businessTripService;

    /** 分页查询出差申请列表 */
    @GetMapping("/list")
    @SaCheckPermission("oa:trip:list")
    public R list(BusinessTrip query,
                  @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                  @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
        IPage<BusinessTrip> page = businessTripService.queryPage(query, pageNum, pageSize);
        return R.ok(page);
    }

    /**
     * 导出出差申请列表
     */
    @SysLog("导出出差申请")
    @GetMapping("/export")
    @SaCheckPermission("oa:trip:list")
    public void export(BusinessTrip query, HttpServletResponse response) {
        // 复用现有筛选与数据权限逻辑，保证导出结果和列表一致。
        List<BusinessTripExportVo> rows = businessTripService.queryPage(query, 1, Integer.MAX_VALUE)
                .getRecords()
                .stream()
                .map(BusinessTripExportVo::from)
                .toList();
        ExcelUtil.exportExcel(rows, "出差申请", BusinessTripExportVo.class, response);
    }

    /** 获取详情 */
    @GetMapping("/{id}")
    @SaCheckPermission("oa:trip:list")
    public R getInfo(@PathVariable("id") Long id) {
        BusinessTrip trip = businessTripService.getById(id);
        return trip != null ? R.ok(trip) : R.fail("出差申请不存在");
    }

    /** 新增（草稿） */
    @SysLog("新增出差申请")
    @PostMapping
    @SaCheckPermission("oa:trip:add")
    public R add(@RequestBody BusinessTrip trip) {
        return R.result(businessTripService.createTrip(trip));
    }

    /** 修改 */
    @SysLog("修改出差申请")
    @PutMapping
    @SaCheckPermission("oa:trip:edit")
    public R edit(@RequestBody BusinessTrip trip) {
        if (trip.getId() == null) {
            return R.fail("ID不能为空");
        }
        return R.result(businessTripService.updateById(trip));
    }

    /** 删除 */
    @SysLog("删除出差申请")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:trip:remove")
    public R remove(@PathVariable("ids") List<Long> ids) {
        return R.result(businessTripService.removeBatchByIds(ids));
    }

    /** 提交审批 */
    @SysLog("提交出差申请")
    @PostMapping("/submit/{id}")
    @SaCheckPermission("oa:trip:submit")
    public R submit(@PathVariable("id") Long id) {
        return R.result(businessTripService.submitTrip(id));
    }

    /** 取消 */
    @SysLog("取消出差申请")
    @PutMapping("/cancel/{id}")
    @SaCheckPermission("oa:trip:cancel")
    public R cancel(@PathVariable("id") Long id) {
        return R.result(businessTripService.cancelTrip(id));
    }
}

