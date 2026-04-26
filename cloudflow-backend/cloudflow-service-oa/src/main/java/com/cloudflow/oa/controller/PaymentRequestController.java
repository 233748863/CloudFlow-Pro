package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeHelper;
import com.cloudflow.common.excel.utils.ExcelUtil;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.export.PaymentRequestExportVo;
import com.cloudflow.oa.service.IPaymentRequestService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

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
    public R<Page<BizPaymentRequest>> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String paymentType,
            @RequestParam(required = false) Long userId) {
        Page<BizPaymentRequest> page = new Page<>(pageNum, pageSize);
        return R.ok(paymentRequestService.page(page, buildQueryWrapper(status, paymentType, userId)));
    }

    /**
     * 导出付款申请列表
     */
    @SysLog("导出付款申请")
    @GetMapping("/export")
    public void export(@RequestParam(required = false) String status,
                       @RequestParam(required = false) String paymentType,
                       @RequestParam(required = false) Long userId,
                       HttpServletResponse response) {
        // 统一复用列表筛选与数据权限逻辑，保证导出结果与页面一致。
        List<PaymentRequestExportVo> rows = paymentRequestService.list(buildQueryWrapper(status, paymentType, userId))
                .stream()
                .map(PaymentRequestExportVo::from)
                .toList();
        ExcelUtil.exportExcel(rows, "付款申请", PaymentRequestExportVo.class, response);
    }

    /**
     * 查询付款申请详情
     */
    @GetMapping("/{id}")
    public R<BizPaymentRequest> getInfo(@PathVariable Long id) {
        return R.ok(paymentRequestService.getById(id));
    }

    /**
     * 新增付款申请
     */
    @SysLog("新增付款申请")
    @PostMapping
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
    public R<Void> remove(@PathVariable Long[] ids) {
        for (Long id : ids) {
            BizPaymentRequest payment = new BizPaymentRequest();
            payment.setId(id);
            payment.setDelFlag("1");
            paymentRequestService.updateById(payment);
        }
        return R.ok();
    }

    /**
     * 提交付款申请
     */
    @SysLog("提交付款申请")
    @PostMapping("/submit/{id}")
    public R<Void> submit(@PathVariable Long id) {
        try {
            return paymentRequestService.submitPayment(id) ? R.ok() : R.fail("提交失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 按部门统计月度付款费用
     */
    @GetMapping("/stats/dept")
    public R<List<Map<String, Object>>> getMonthlyPaymentByDept(@RequestParam String month) {
        return R.ok(paymentRequestService.getMonthlyPaymentByDept(month));
    }

    /**
     * 统一构建列表与导出的查询条件，确保两处结果保持一致。
     */
    private LambdaQueryWrapper<BizPaymentRequest> buildQueryWrapper(String status, String paymentType, Long userId) {
        LambdaQueryWrapper<BizPaymentRequest> wrapper = new LambdaQueryWrapper<>();
        // 空字符串不作为过滤条件，例如 paymentType="" 表示不过滤类型
        wrapper.eq(StringUtils.hasText(status), BizPaymentRequest::getStatus, status)
                .eq(StringUtils.hasText(paymentType), BizPaymentRequest::getPaymentType, paymentType)
                .eq(userId != null, BizPaymentRequest::getUserId, userId)
                .eq(BizPaymentRequest::getDelFlag, "0");

        DataScopeHelper.apply(wrapper, BizPaymentRequest::getUserId, BizPaymentRequest::getDeptId);
        wrapper.orderByDesc(BizPaymentRequest::getCreateTime);
        return wrapper;
    }
}
