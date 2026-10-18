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

@RestControllerAdvice(assignableTypes = {AssetController.class, AssetLifecycleController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AssetExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(AssetExceptionHandler.class);
    private static final String INVALID_PARAMETER = "资产业务参数无效，请核对后重试";
    private static final Set<String> CONFLICTS = Set.of(
            "记录已修改，请刷新后重试", "资产保管人已变化，请刷新调拨单", "资产所属部门已变化，请刷新调拨单",
            "折旧计划超过可折旧总额，请重新预览核对", "不能覆盖已过账折旧");
    private static final Set<String> MESSAGES = Set.of(
            "记录不存在或无权访问", "状态或类型取值无效", "开关只能为0或1", "资产ID不能为空",
            "残值率不能超过1", "默认寿命必须为1至1200个月",
            "分类存在循环引用", "分类路径过长", "子分类路径过长", "分类仍被引用", "请选择资产分类", "资产分类已停用",
            "保险提醒天数不能为负数", "保险日期区间无效", "已有折旧历史，金额或寿命变更须走维修资本化及延寿",
            "资产净值不能小于残值", "在用或已有折旧历史的资产不能删除", "折旧频率无效", "折旧寿命不能为空",
            "折旧寿命必须为1至1200个月", "折旧起算日不能为空", "残值与历史累计折旧不能超过资产原值",
            "资产仍有待折旧金额，需先延长使用寿命", "已过账折旧缺少日期", "已过账折旧日期与资产起算日不一致",
            "已终止使用的资产不能生成折旧", "资产未启用折旧", "资产原值未确定", "资产使用寿命未设置", "延长寿命不能为负数",
            "终止使用的资产不能安排维保", "自定义间隔必须大于0天", "负责人不存在或不属于当前租户", "下次维保日期不能为空",
            "提醒天数不能为负数", "实际完成日不能在未来", "资产提醒接收人不属于当前租户，请配置管理人",
            "该资产不能送修", "故障日期不能为空", "延寿月数不能为负数", "延寿后使用寿命必须为1至1200个月", "已结束维修单不能修改",
            "审批中的维修单不能修改", "维修审批正在处理", "调拨日期不能为空", "目标保管人不能为空",
            "目标保管人不属于当前租户", "目标部门不属于当前租户", "调拨单当前不可编辑", "仅草稿调拨单可提交执行",
            "该资产已终止使用", "仅闲置资产可以领用", "仅在用资产可以归还", "目标保管人已失效", "目标部门已失效",
            "资产审批人未正确配置", "维修单不能更换资产", "调拨单不能更换资产", "维保计划不能更换资产");
    private static final Map<String, Integer> TEXT_LIMITS = Map.of(
            "分类编码", 50, "分类名称", 100, "资产名称", 100, "资产编码", 50, "维保名称", 200,
            "故障描述", 10000, "维修处理记录", 10000, "调拨原因", 500);
    private static final Set<String> AMOUNT_LABELS = Set.of(
            "残值率", "资产原值", "残值", "期初折旧", "期初累计折旧", "保险金额", "维保费用", "维修费用", "停机小时数");

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<R<Void>> invalidCommand(IllegalArgumentException exception) {
        String detail = exception.getMessage();
        if (detail != null && CONFLICTS.contains(detail)) return response(HttpStatus.CONFLICT, detail);
        return response(HttpStatus.BAD_REQUEST, knownMessage(detail) ? detail : INVALID_PARAMETER);
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<R<Void>> invalidState(IllegalStateException exception) {
        String detail = exception.getMessage();
        if (detail != null && CONFLICTS.contains(detail)) return response(HttpStatus.CONFLICT, detail);
        // 未识别的程序状态沿用服务异常口径，不把异常原文返回给调用者。
        String message = SafeErrorResponse.withTraceId("服务异常，请联系管理员");
        LOG.error("资产操作失败: {}", message);
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
