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

@RestControllerAdvice(assignableTypes = RfqController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RfqExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(RfqExceptionHandler.class);
    private static final Set<String> FORBIDDEN = Set.of("无权读取该供应商报价及附件", "仅采购负责人或定标审批人可查看比价");
    private static final Set<String> MESSAGES = Set.of(
            "中标报价不属于当前询价",
            "中标报价须已提交且在有效期内",
            "仅已提交报价可以撤回",
            "仅截止日期内的报价中询价可以录入或撤回报价",
            "仅未关联询价的草稿采购申请可发起询价",
            "仅采购负责人或定标审批人可查看比价",
            "供应商已停用",
            "附件内容与文件类型不一致",
            "业务附件须为不超过10 MB的PDF、PNG或JPEG文件",
            "仅支持PDF、PNG和JPEG业务扫描件",
            "业务附件引用无效，请通过专用入口上传",
            "业务附件引用无效",
            "业务附件类型无效",
            "业务附件必须由录入人从业务专用入口上传",
            "供应商已禁止该业务",
            "供应商已经响应",
            "供应商邀请状态已改变",
            "发出后的询价内容不能修改，请新建询价轮次",
            "只有流标或取消询价可以重新发起",
            "同一询价物料不能重复报价",
            "定标审批人未正确配置",
            "已生成采购申请，不能更换物料关联",
            "已结束或审批中的询价不能取消或流标",
            "当前供应商邀请已结束，请发起新询价轮次",
            "当前询价不可邀请报价",
            "当前询价不能登记拒绝",
            "报价不属于当前询价",
            "报价不能为空",
            "报价供应商不能更换",
            "报价已过有效期",
            "报价币种无效",
            "报价截止前不能查看各家比价",
            "报价截止日期不能为空",
            "报价截止日期不能早于今天",
            "报价数量必须为正整数",
            "报价数量必须与询价物料一致",
            "报价日期不能晚于今天",
            "报价明细不能为空",
            "报价明细数量无效",
            "报价明细标识与来源不一致",
            "报价有效期已过",
            "报价物料不属于当前询价",
            "提交报价须覆盖全部询价物料",
            "无权读取该供应商报价及附件",
            "期望交付日期不能早于报价截止日期",
            "每轮询价最多邀请200家供应商",
            "物料不属于当前询价",
            "状态或类型取值无效",
            "耗材关联不能为空",
            "记录不存在或无权访问",
            "询价单不能为空",
            "询价定标完成后才能生成采购申请",
            "询价尚未完成定标",
            "询价已结束或正在定标审批",
            "询价数量单位与耗材单位不一致，不能直接生成采购",
            "询价数量必须为正整数",
            "询价明细不属于当前单据",
            "询价明细不能为空",
            "询价明细重复",
            "询价来源不能更换",
            "询价需要1至500项物料",
            "该供应商本轮已有报价，请由原录入人编辑原单据",
            "该采购申请已有有效询价，请继续原询价轮次",
            "请先撤回已提交报价再编辑",
            "请选择1至200家供应商",
            "邀请渠道无效",
            "邮件尚未被接纳，不能作为已邀请供应商登记报价",
            "邮件尚未被接纳，不能登记供应商拒绝",
            "采购申请已关联其他询价",
            "非最低价定标需填写不少于20字的详细理由");
    private static final Map<String, Integer> TEXT_LIMITS = Map.ofEntries(
            Map.entry("询价标题", 200), Map.entry("物料名称", 100), Map.entry("拒绝原因", 500),
            Map.entry("结束原因", 500), Map.entry("付款条件", 50), Map.entry("报价备注", 500),
            Map.entry("品牌", 100), Map.entry("型号", 100), Map.entry("明细备注", 500), Map.entry("定标理由", 500));

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<R<Void>> invalidCommand(IllegalArgumentException exception) {
        String message = exception.getMessage();
        if (FORBIDDEN.contains(message == null ? "" : message)) return response(HttpStatus.FORBIDDEN, message);
        return response(HttpStatus.BAD_REQUEST, knownMessage(message) ? message : "询价或报价参数无效，请核对后重试");
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<R<Void>> invalidState(IllegalStateException exception) {
        if ("记录已修改，请刷新后重试".equals(exception.getMessage())) return response(HttpStatus.CONFLICT, exception.getMessage());
        String message = SafeErrorResponse.withTraceId("服务异常，请联系管理员");
        LOG.error("询价操作失败: {}", message);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, message);
    }

    private static boolean knownMessage(String message) {
        if (message == null) return false;
        if (MESSAGES.contains(message)) return true;
        for (Map.Entry<String, Integer> entry : TEXT_LIMITS.entrySet()) {
            if ((entry.getKey() + "不能为空且不能超过" + entry.getValue() + "个字符").equals(message)) return true;
        }
        return Set.of("交付天数不能为负数", "质保月数不能为负数", "明细交付天数不能为负数",
                "折扣率必须在0至1之间", "税率必须在0至1之间", "金额不能为空", "金额超出精度或数值范围").contains(message);
    }

    private static ResponseEntity<R<Void>> response(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(R.fail(status.value(), message));
    }
}
