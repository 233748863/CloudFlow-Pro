package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.excel.utils.ExcelUtil;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.dto.VehicleExpenseConvertDTO;
import com.cloudflow.oa.domain.export.ExpenseClaimExportVo;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.service.IExpenseClaimService;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 报销申请 Controller
 */
@RestController
@RequestMapping("/expense/claim")
public class ExpenseClaimController {

    @Autowired
    private IExpenseClaimService expenseClaimService;

    /**
     * 分页查询报销申请列表
     */
    @GetMapping("/list")
    @SaCheckPermission("oa:expense:list")
    public R<Page<BizExpenseClaim>> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Long userId) {
        return R.ok(expenseClaimService.queryPage(pageNum, pageSize, status, category, userId));
    }

    /**
     * 导出报销申请列表
     */
    @SysLog("导出报销申请")
    @GetMapping("/export")
    @SaCheckPermission("oa:expense:list")
    public void export(@RequestParam(required = false) String status,
                       @RequestParam(required = false) String category,
                       @RequestParam(required = false) Long userId,
                       HttpServletResponse response) {
        List<ExpenseClaimExportVo> rows = expenseClaimService.listForExport(status, category, userId)
                .stream()
                .map(ExpenseClaimExportVo::from)
                .toList();
        ExcelUtil.exportExcel(rows, "报销申请", ExpenseClaimExportVo.class, response);
    }

    /**
     * 查询报销申请详情（含明细）
     */
    @GetMapping("/{id}")
    @SaCheckPermission("oa:expense:list")
    public R<BizExpenseClaim> getInfo(@PathVariable Long id) {
        return R.ok(expenseClaimService.getClaimWithItems(id));
    }

    /**
     * 新增报销申请
     */
    @SysLog("新增报销申请")
    @PostMapping
    @SaCheckPermission("oa:expense:add")
    public R<Void> add(@RequestBody BizExpenseClaim claim) {
        try {
            return expenseClaimService.createClaim(claim) ? R.ok() : R.fail("创建失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 修改报销申请
     */
    @SysLog("修改报销申请")
    @PutMapping
    @SaCheckPermission("oa:expense:edit")
    public R<Void> edit(@RequestBody BizExpenseClaim claim) {
        try {
            return expenseClaimService.updateClaim(claim) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 删除报销申请
     */
    @SysLog("删除报销申请")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:expense:remove")
    public R<Void> remove(@PathVariable Long[] ids) {
        for (Long id : ids) {
            BizExpenseClaim claim = new BizExpenseClaim();
            claim.setId(id);
            claim.setDeleted(1);
            expenseClaimService.updateById(claim);
        }
        return R.ok();
    }

    /**
     * 提交报销申请
     */
    @SysLog("提交报销申请")
    @PostMapping("/submit/{id}")
    @SaCheckPermission("oa:expense:submit")
    public R<Void> submit(@PathVariable Long id) {
        try {
            return expenseClaimService.submitClaim(id) ? R.ok() : R.fail("提交失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认报销打款")
    @PostMapping("/{id}/pay")
    @SaCheckPermission("oa:expense:pay")
    public R<Void> confirmPaid(@PathVariable Long id) {
        try {
            return expenseClaimService.confirmPaid(id) ? R.ok() : R.fail("确认打款失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 车辆费用转报销单
     */
    @SysLog("车辆费用转报销单")
    @PostMapping("/convert")
    @SaCheckPermission("oa:expense:add")
    public R<Void> convertVehicleExpense(@RequestBody VehicleExpenseConvertDTO dto) {
        return expenseClaimService.convertVehicleExpenseToClaim(dto.getVehicleExpenseIds(), dto.getUserId())
                ? R.ok() : R.fail("转换失败");
    }

    /**
     * 按部门统计月度报销费用
     */
    @GetMapping("/stats/dept")
    @SaCheckPermission("oa:expense:list")
    public R<List<DynamicMapVO>> getMonthlyExpenseByDept(@RequestParam String month) {
        return R.ok(expenseClaimService.getMonthlyExpenseByDept(month).stream().map(DynamicMapVO::from).toList());
    }

    /**
     * 按类别统计月度报销费用
     */
    @GetMapping("/stats/category")
    @SaCheckPermission("oa:expense:list")
    public R<List<DynamicMapVO>> getMonthlyExpenseByCategory(@RequestParam String month) {
        return R.ok(expenseClaimService.getMonthlyExpenseByCategory(month).stream().map(DynamicMapVO::from).toList());
    }
}

