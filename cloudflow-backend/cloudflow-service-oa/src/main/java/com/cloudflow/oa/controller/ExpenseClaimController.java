package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeHelper;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.service.IExpenseClaimService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 报销申请Controller
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
    public R<Page<BizExpenseClaim>> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Long userId) {
        
        Page<BizExpenseClaim> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<BizExpenseClaim> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(status != null, BizExpenseClaim::getStatus, status)
               .eq(category != null, BizExpenseClaim::getCategory, category)
               .eq(userId != null, BizExpenseClaim::getUserId, userId)
               .eq(BizExpenseClaim::getDelFlag, "0");

        // 数据权限过滤：根据当前用户的权限类型，自动追加部门/用户过滤条件
        DataScopeHelper.apply(wrapper, BizExpenseClaim::getUserId, BizExpenseClaim::getDeptId);

        wrapper.orderByDesc(BizExpenseClaim::getCreateTime);
        
        return R.ok(expenseClaimService.page(page, wrapper));
    }

    /**
     * 查询报销申请详情（含明细）
     */
    @GetMapping("/{id}")
    public R<BizExpenseClaim> getInfo(@PathVariable Long id) {
        return R.ok(expenseClaimService.getClaimWithItems(id));
    }

    /**
     * 新增报销申请
     */
    @SysLog("新增报销申请")
    @PostMapping
    public R<Void> add(@RequestBody BizExpenseClaim claim) {
        return expenseClaimService.createClaim(claim) ? R.ok() : R.fail("创建失败");
    }

    /**
     * 修改报销申请
     */
    @SysLog("修改报销申请")
    @PutMapping
    public R<Void> edit(@RequestBody BizExpenseClaim claim) {
        return expenseClaimService.updateClaim(claim) ? R.ok() : R.fail("更新失败");
    }

    /**
     * 删除报销申请
     */
    @SysLog("删除报销申请")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable Long[] ids) {
        for (Long id : ids) {
            BizExpenseClaim claim = new BizExpenseClaim();
            claim.setId(id);
            claim.setDelFlag("1");
            expenseClaimService.updateById(claim);
        }
        return R.ok();
    }

    /**
     * 提交报销申请
     */
    @SysLog("提交报销申请")
    @PostMapping("/submit/{id}")
    public R<Void> submit(@PathVariable Long id) {
        return expenseClaimService.submitClaim(id) ? R.ok() : R.fail("提交失败");
    }

    /**
     * 车辆费用转报销单
     */
    @SysLog("车辆费用转报销单")
    @PostMapping("/convert")
    public R<Void> convertVehicleExpense(
            @RequestBody Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Long> vehicleExpenseIds = (List<Long>) params.get("vehicleExpenseIds");
        Long userId = Long.valueOf(params.get("userId").toString());
        return expenseClaimService.convertVehicleExpenseToClaim(vehicleExpenseIds, userId) 
            ? R.ok() : R.fail("转换失败");
    }

    /**
     * 按部门统计月度报销费用
     */
    @GetMapping("/stats/dept")
    public R<List<Map<String, Object>>> getMonthlyExpenseByDept(
            @RequestParam String month) {
        return R.ok(expenseClaimService.getMonthlyExpenseByDept(month));
    }

    /**
     * 按类别统计月度报销费用
     */
    @GetMapping("/stats/category")
    public R<List<Map<String, Object>>> getMonthlyExpenseByCategory(
            @RequestParam String month) {
        return R.ok(expenseClaimService.getMonthlyExpenseByCategory(month));
    }
}
