package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeHelper;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.service.IPaymentRequestService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 付款申请Controller
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
        LambdaQueryWrapper<BizPaymentRequest> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(status != null, BizPaymentRequest::getStatus, status)
               .eq(paymentType != null, BizPaymentRequest::getPaymentType, paymentType)
               .eq(userId != null, BizPaymentRequest::getUserId, userId)
               .eq(BizPaymentRequest::getDelFlag, "0");

        // 数据权限过滤：根据当前用户的权限类型，自动追加部门/用户过滤条件
        DataScopeHelper.apply(wrapper, BizPaymentRequest::getUserId, BizPaymentRequest::getDeptId);

        wrapper.orderByDesc(BizPaymentRequest::getCreateTime);
        
        return R.ok(paymentRequestService.page(page, wrapper));
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
        // 从当前登录用户上下文中填充用户信息
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
        return paymentRequestService.save(payment) ? R.ok() : R.fail("创建失败");
    }

    /**
     * 修改付款申请
     */
    @SysLog("修改付款申请")
    @PutMapping
    public R<Void> edit(@RequestBody BizPaymentRequest payment) {
        return paymentRequestService.updateById(payment) ? R.ok() : R.fail("更新失败");
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
        return paymentRequestService.submitPayment(id) ? R.ok() : R.fail("提交失败");
    }

    /**
     * 按部门统计月度付款费用
     */
    @GetMapping("/stats/dept")
    public R<List<Map<String, Object>>> getMonthlyPaymentByDept(
            @RequestParam String month) {
        return R.ok(paymentRequestService.getMonthlyPaymentByDept(month));
    }
}
