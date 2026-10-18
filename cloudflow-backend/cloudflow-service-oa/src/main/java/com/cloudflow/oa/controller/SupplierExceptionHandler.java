package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.SafeErrorResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.Set;

@RestControllerAdvice(assignableTypes = {SupplierController.class, SupplierGovernanceController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SupplierExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(SupplierExceptionHandler.class);
    private static final String CONFLICT = "记录已修改，请刷新后重试";
    private static final Set<String> MESSAGES = Set.of(
            "记录不存在或无权访问", "状态或类型取值无效", "开关只能为0或1", "供应商ID不能为空",
            "统一社会信用代码应为18位字母数字", "供应商分类已停用", "税率不能超过1",
            "供应商仍被业务单据引用，请改为停用", "分类不能循环引用", "分类层级路径过长", "子分类层级路径过长", "分类仍被引用",
            "到期日不能为空", "到期日不能早于签发日", "提前提醒天数不能为负数", "资质不能更换供应商", "过期证件不能核验通过",
            "评分卡不能为空", "周期开始日不能为空", "周期结束日不能为空", "评分周期无效", "已确认评分不能修改",
            "评分卡不能更换供应商", "评分维度不能为空", "本期自动维度仅支持交付及时率", "没有可用评分，不能确认",
            "评分维度编码重复", "权重不能超过1", "维度满分必须大于0", "得分不能超过满分", "评分权重之和必须为1",
            "供应商已有审批正在处理", "供应商当前未在黑名单中", "供应商已在黑名单中", "放行有效期不能为空",
            "放行有效期已过期", "供应商审批人未正确配置", "供应商提醒接收人不属于当前租户，请配置管理人");
    private static final Map<String, Integer> TEXT_LIMITS = Map.ofEntries(
            Map.entry("供应商名称", 100), Map.entry("供应商编号", 50), Map.entry("统一社会信用代码", 18),
            Map.entry("币种", 10), Map.entry("分类编码", 50), Map.entry("分类名称", 100), Map.entry("证件名称", 100),
            Map.entry("不通过原因", 500), Map.entry("维度名称", 100), Map.entry("维度编码", 50), Map.entry("申请原因", 500));
    private static final Set<String> AMOUNT_LABELS = Set.of("注册资本", "税率", "维度权重", "满分", "维度得分");

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<R<Void>> invalidCommand(IllegalArgumentException exception) {
        String detail = exception.getMessage();
        if (CONFLICT.equals(detail)) return response(HttpStatus.CONFLICT, detail);
        return response(HttpStatus.BAD_REQUEST, knownMessage(detail) ? detail : "供应商业务参数无效，请核对后重试");
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<R<Void>> invalidState(IllegalStateException exception) {
        String detail = exception.getMessage();
        if (CONFLICT.equals(detail)) return response(HttpStatus.CONFLICT, detail);
        if ("供应商评级阈值无效".equals(detail)) return response(HttpStatus.BAD_REQUEST, detail);
        String message = SafeErrorResponse.withTraceId("服务异常，请联系管理员");
        LOG.error("供应商操作失败: {}", message);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, message);
    }

    private static boolean knownMessage(String detail) {
        if (detail == null) return false;
        if (MESSAGES.contains(detail)) return true;
        for (Map.Entry<String, Integer> entry : TEXT_LIMITS.entrySet()) {
            if ((entry.getKey() + "不能为空且不能超过" + entry.getValue() + "个字符").equals(detail)) return true;
        }
        for (String label : AMOUNT_LABELS) {
            if ((label + "不能为空").equals(detail) || (label + "超出精度或数值范围").equals(detail)) return true;
        }
        return false;
    }

    private static ResponseEntity<R<Void>> response(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(R.fail(status.value(), message));
    }
}
