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

@RestControllerAdvice(assignableTypes = {ProjectController.class, TimesheetController.class,
        ActivityCatalogController.class, ProjectTemplateController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ProjectExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ProjectExceptionHandler.class);
    private static final Set<String> CONFLICTS = Set.of("记录已修改，请刷新后重试", "任务树已变化，请刷新完整任务树后重试");
    private static final Set<String> MESSAGES = Set.of(
            "记录不存在或无权访问", "状态或类型取值无效", "开关只能为0或1",
            "项目进度模式无效", "项目ID不能为空", "只有草稿或已驳回项目可以提交立项",
            "项目成员信息不完整", "项目成员ID不能为空", "指定任务不是里程碑",
            "退出日期不能早于加入日期", "成员不能更换所属项目", "成员不能更换员工",
            "项目风险信息不完整", "项目风险ID不能为空", "当前项目状态不允许归档",
            "项目不能为空", "项目名称不能为空", "项目不存在",
            "任务ID不能为空", "依赖ID不能为空", "活动类型已停用",
            "单价范围只能选择员工、职级或默认其中一项", "生效结束日早于开始日", "同一范围的单价有效期不能重叠",
            "工作日期未匹配到有效单价，请联系管理者配置", "员工不存在或无权访问", "职级不存在或无权访问",
            "生效开始日不能为空", "单价不能更换活动类型", "工时单需要1至500条明细",
            "工时单日期跨度必须为1至31天", "工作日期必须位于单据期间内且不能在未来", "单条工时不能为0",
            "正数工时不能关联冲正来源", "只能填报本人参与的有效项目", "只能填报本人在工作日期参与的有效项目", "工时选择期间必须为1至31天", "分组或取消任务不能直接填报工时",
            "开始与结束时刻必须同时填写", "时段长度与填写工时不一致", "只能冲正已审批的正数工时",
            "工时开始日期不能为空", "工时结束日期不能为空", "工时项目不能为空",
            "活动类型不能为空", "工作日期不能为空", "任务不属于所选项目",
            "负数工时必须关联原已审批明细", "只能冲正本人工时", "累计冲正工时超过原明细工时", "冲正项目必须与原明细一致",
            "冲正任务必须与原明细一致", "冲正活动类型必须与原明细一致", "冲正工作日期必须与原明细一致",
            "原工时成本快照缺失", "原工时计费快照缺失", "原工时成本金额缺失",
            "原工时计费金额缺失", "模板任务数必须为1至500", "模板任务ID重复",
            "任务权重必须大于0", "普通任务持续天数必须为正数", "里程碑不能包含子任务",
            "模板已停用", "请在空任务树上应用模板，避免重复创建", "模板不能为空",
            "模板任务不能为空", "请先设置项目开始日期", "项目开始日期不能为空",
            "任务ID重复", "任务树存在循环引用", "项目任务最多五层",
            "父任务不存在或不属于本项目", "只有分组任务可以包含子任务", "任务不能依赖自身",
            "任务依赖形成循环", "只能查看本人参与项目的任务", "无工时审核查看权限",
            "已提交工时不能修改，已审批工时请新建冲正单", "仅草稿或驳回工时可以提交", "已提交工时不能删除",
            "当前账号须关联唯一在职员工，请联系人事配置", "无权查看该工时单", "工时单不能为空",
            "项目经理未配置或已停用", "原员工记录不存在", "原员工账号不存在",
            "用户未登录", "账号不存在", "只能操作本人工时单",
            "归档或取消项目不可修改任务", "分组任务不能同时作为里程碑", "进度不能超过100",
            "计划结束不能早于开始", "优先级无效", "已有工时的任务不能变成分组",
            "任务树已变化，请刷新完整任务树后重试", "任务编号不能为空或重复", "任务顺序必须为非负整数",
            "含期初工时的任务不可删除", "任务仍被子任务、工时或依赖引用", "相同类型的任务依赖已存在",
            "负责人不属于当前租户", "任务不能更换项目", "任务不属于当前项目",
            "前置任务不属于当前项目", "后置任务不属于当前项目", "依赖不能更换项目");
    private static final Map<String, Integer> TEXT_LIMITS = Map.ofEntries(
            Map.entry("活动编码", 50),
            Map.entry("活动名称", 100),
            Map.entry("工作内容", 10000),
            Map.entry("模板编码", 50),
            Map.entry("模板名称", 200),
            Map.entry("任务名称", 255),
            Map.entry("任务编号", 50));
    private static final Set<String> AMOUNT_LABELS = Set.of("预估成本", "其他成本", "成本单价", "计费单价", "工时", "总工时", "计费工时", "成本金额", "计费金额", "工时金额", "冲正金额", "任务权重", "计划工时", "任务进度");

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<R<Void>> invalidCommand(IllegalArgumentException exception) {
        String detail = exception.getMessage();
        if (CONFLICTS.contains(detail == null ? "" : detail)) return response(HttpStatus.CONFLICT, detail);
        if ("项目不存在".equals(detail)) return response(HttpStatus.NOT_FOUND, detail);
        if ("项目创建失败".equals(detail)) return failure();
        return response(HttpStatus.BAD_REQUEST, knownMessage(detail) ? detail : "项目或工时参数无效，请核对后重试");
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<R<Void>> invalidState(IllegalStateException exception) {
        String detail = exception.getMessage();
        if (CONFLICTS.contains(detail == null ? "" : detail)) return response(HttpStatus.CONFLICT, detail);
        if ("单日工时上限配置必须大于0且不超过24小时".equals(detail)) return response(HttpStatus.BAD_REQUEST, detail);
        return failure();
    }

    private static boolean knownMessage(String detail) {
        if (detail == null) return false;
        if (MESSAGES.contains(detail) || detail.matches("\\d{4}-\\d{2}-\\d{2}累计工时超过\\d+(?:\\.\\d+)?小时")) return true;
        for (Map.Entry<String, Integer> entry : TEXT_LIMITS.entrySet()) {
            if ((entry.getKey() + "不能为空且不能超过" + entry.getValue() + "个字符").equals(detail)) return true;
        }
        for (String label : AMOUNT_LABELS) {
            if ((label + "不能为空").equals(detail) || (label + "超出精度或数值范围").equals(detail)) return true;
        }
        return false;
    }

    private static ResponseEntity<R<Void>> failure() {
        String message = SafeErrorResponse.withTraceId("服务异常，请联系管理员");
        LOG.error("项目或工时操作失败: {}", message);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, message);
    }

    private static ResponseEntity<R<Void>> response(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(R.fail(status.value(), message));
    }
}
