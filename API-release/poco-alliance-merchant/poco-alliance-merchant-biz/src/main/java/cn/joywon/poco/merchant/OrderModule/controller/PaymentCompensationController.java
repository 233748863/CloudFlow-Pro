package cn.joywon.poco.merchant.OrderModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.OrderModule.scheduler.PaymentConsistencyScheduler;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 支付补偿控制器
 * 提供手动触发补偿的接口,用于紧急情况或测试
 * 
 * 注意: 这些接口需要管理员权限
 * 
 * @author poco
 * @date 2026-01-26
 */
@Slf4j
@RestController
@RequestMapping("/order/compensation")
@RequiredArgsConstructor
@Tag(name = "支付补偿管理", description = "支付/退款状态补偿相关接口")
public class PaymentCompensationController {

    private final PaymentConsistencyScheduler scheduler;

    /**
     * 手动补偿支付状态
     * 
     * 使用场景:
     * 1. 紧急情况需要立即补偿某个订单
     * 2. 测试补偿逻辑是否正常
     * 3. 运维人工介入处理异常订单
     * 
     * @param orderNo 订单号
     * @return 补偿结果
     */
    @Operation(summary = "手动补偿支付状态", description = "手动触发指定订单的支付状态补偿")
    @PostMapping("/payment/{orderNo}")
    @PreAuthorize("@pms.hasPermission('order:compensation:payment')")
    public R<String> compensatePayment(@PathVariable String orderNo) {
        log.info("收到手动补偿支付请求: orderNo={}", orderNo);

        try {
            String result = scheduler.manualCompensatePayment(orderNo);
            
            if (result.contains("成功")) {
                return R.ok(result, "补偿成功");
            } else {
                return R.failed(result);
            }
            
        } catch (Exception e) {
            log.error("手动补偿支付失败: orderNo={}", orderNo, e);
            return R.failed("补偿失败: " + e.getMessage());
        }
    }

    /**
     * 手动补偿退款状态
     * 
     * 使用场景:
     * 1. 紧急情况需要立即补偿某个退款
     * 2. 测试补偿逻辑是否正常
     * 3. 运维人工介入处理异常退款
     * 
     * @param refundNo 退款单号
     * @return 补偿结果
     */
    @Operation(summary = "手动补偿退款状态", description = "手动触发指定退款的状态补偿")
    @PostMapping("/refund/{refundNo}")
    @PreAuthorize("@pms.hasPermission('order:compensation:refund')")
    public R<String> compensateRefund(@PathVariable String refundNo) {
        log.info("收到手动补偿退款请求: refundNo={}", refundNo);

        try {
            String result = scheduler.manualCompensateRefund(refundNo);
            
            if (result.contains("成功")) {
                return R.ok(result, "补偿成功");
            } else {
                return R.failed(result);
            }
            
        } catch (Exception e) {
            log.error("手动补偿退款失败: refundNo={}", refundNo, e);
            return R.failed("补偿失败: " + e.getMessage());
        }
    }

    /**
     * 立即执行支付补偿任务
     * 
     * 使用场景:
     * 1. 不等待定时任务,立即执行一次补偿
     * 2. 测试定时任务逻辑
     * 
     * @return 执行结果
     */
    @Operation(summary = "立即执行支付补偿任务", description = "不等待定时任务,立即执行一次支付补偿")
    @PostMapping("/payment/execute")
    @PreAuthorize("@pms.hasPermission('order:compensation:execute')")
    public R<String> executePaymentCompensation() {
        log.info("收到立即执行支付补偿任务请求");

        try {
            scheduler.compensatePaymentInconsistency();
            return R.ok("任务执行完成,请查看日志了解详情");
            
        } catch (Exception e) {
            log.error("执行支付补偿任务失败", e);
            return R.failed("任务执行失败: " + e.getMessage());
        }
    }

    /**
     * 立即执行退款补偿任务
     * 
     * 使用场景:
     * 1. 不等待定时任务,立即执行一次补偿
     * 2. 测试定时任务逻辑
     * 
     * @return 执行结果
     */
    @Operation(summary = "立即执行退款补偿任务", description = "不等待定时任务,立即执行一次退款补偿")
    @PostMapping("/refund/execute")
    @PreAuthorize("@pms.hasPermission('order:compensation:execute')")
    public R<String> executeRefundCompensation() {
        log.info("收到立即执行退款补偿任务请求");

        try {
            scheduler.compensateRefundInconsistency();
            return R.ok("任务执行完成,请查看日志了解详情");
            
        } catch (Exception e) {
            log.error("执行退款补偿任务失败", e);
            return R.failed("任务执行失败: " + e.getMessage());
        }
    }
}
