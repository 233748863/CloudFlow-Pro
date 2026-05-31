package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.excel.utils.ExcelUtil;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.export.PaymentRequestExportVo;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.service.IPaymentRequestService;
import jakarta.servlet.http.HttpServletResponse;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 付款申请 Controller
 */
@RestController
@RequestMapping("/payment/request")
public class PaymentRequestController {

    @Autowired
    private IPaymentRequestService paymentRequestService;

    /**
     * 分页查询付款申请列表
     */
    @GetMapping("/list")
    @SaCheckPermission("oa:payment:list")
    public R<Page<BizPaymentRequest>> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String paymentType,
            @RequestParam(required = false) Long userId) {
        return R.ok(paymentRequestService.queryPage(pageNum, pageSize, status, paymentType, userId));
    }

    /**
     * 导出付款申请列表
     */
    @SysLog("导出付款申请")
    @GetMapping("/export")
    @SaCheckPermission("oa:payment:list")
    public void export(@RequestParam(required = false) String status,
                       @RequestParam(required = false) String paymentType,
                       @RequestParam(required = false) Long userId,
                       HttpServletResponse response) {
        List<PaymentRequestExportVo> rows = paymentRequestService.listForExport(status, paymentType, userId)
                .stream()
                .map(PaymentRequestExportVo::from)
                .toList();
        ExcelUtil.exportExcel(rows, "付款申请", PaymentRequestExportVo.class, response);
    }

    /**
     * 查询付款申请详情
     */
    @GetMapping("/{id}")
    @SaCheckPermission("oa:payment:list")
    public R<BizPaymentRequest> getInfo(@PathVariable Long id) {
        return R.ok(paymentRequestService.getById(id));
    }

    /**
     * 新增付款申请
     */
    @SysLog("新增付款申请")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:payment:add")
    public R<Void> add(@RequestBody BizPaymentRequest payment) {
        payment.setUserId(UserContext.getUserId());
        payment.setUserName(UserContext.getUserName());
        payment.setDeptId(UserContext.getDeptId());
        payment.setDeptName(UserContext.getDeptName());
        LocalDateTime now = LocalDateTime.now();
        payment.setCreateBy(UserContext.getUserName());
        payment.setCreateTime(now);
        payment.setUpdateTime(now);
        payment.setPaymentNo(paymentRequestService.generatePaymentNo());
        payment.setStatus("DRAFT");
        try {
            return paymentRequestService.createPayment(payment) ? R.ok() : R.fail("创建失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 修改付款申请
     */
    @SysLog("修改付款申请")
    @PutMapping
    @SaCheckPermission("oa:payment:edit")
    public R<Void> edit(@RequestBody BizPaymentRequest payment) {
        try {
            return paymentRequestService.updatePayment(payment) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 删除付款申请
     */
    @SysLog("删除付款申请")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:payment:remove")
    public R<Void> remove(@PathVariable Long[] ids) {
        for (Long id : ids) {
            BizPaymentRequest payment = new BizPaymentRequest();
            payment.setId(id);
            payment.setDeleted(1);
            paymentRequestService.updateById(payment);
        }
        return R.ok();
    }

    /**
     * 提交付款申请
     */
    @SysLog("提交付款申请")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/submit/{id}")
    @SaCheckPermission("oa:payment:submit")
    public R<Void> submit(@PathVariable Long id) {
        try {
            return paymentRequestService.submitPayment(id) ? R.ok() : R.fail("提交失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 确认付款
     */
    @SysLog("确认付款")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/pay")
    @SaCheckPermission("oa:payment:pay")
    public R<Void> confirmPaid(@PathVariable Long id) {
        try {
            return paymentRequestService.confirmPaid(id) ? R.ok() : R.fail("确认付款失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 按部门统计月度付款费用
     */
    @GetMapping("/stats/dept")
    @SaCheckPermission("oa:payment:list")
    public R<List<DynamicMapVO>> getMonthlyPaymentByDept(@RequestParam String month) {
        return R.ok(paymentRequestService.getMonthlyPaymentByDept(month));
    }
}

