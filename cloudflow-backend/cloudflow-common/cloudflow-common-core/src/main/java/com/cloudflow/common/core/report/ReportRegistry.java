package com.cloudflow.common.core.report;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class ReportRegistry {
    private static final List<String> TEXT_OPERATORS = List.of("EQ", "NE", "IN", "LIKE", "IS_NULL");
    private static final List<String> ORDERED_OPERATORS = List.of("EQ", "NE", "GT", "GE", "LT", "LE", "IN", "BETWEEN", "IS_NULL");
    private static final List<ReportDataset> DATASETS = List.of(
            dataset("WF_INSTANCE", "流程实例", "workflow", "WorkflowReportMapper.instances", "workflow-instance",
                    List.of("workflow:process:view"), true, null,
                    "一实例一行；仅真实结束且结束时间有效的实例计入耗时，单位为秒。",
                    dimension("DEFINITION", "流程定义", "TEXT"), dimension("STATUS", "状态", "TEXT"),
                    dimension("BUSINESS_DATE", "开始日期", "DATE"), dimension("DEPARTMENT", "部门", "ID"),
                    count("INSTANCE_COUNT", "实例数"), duration("DURATION_SECONDS", "已结束耗时", "秒", "AVG", "MAX")),
            dataset("WF_TASK", "任务时效", "workflow", "WorkflowReportMapper.tasks", "workflow-task",
                    List.of("workflow:task:todo", "workflow:task:done"), true, null,
                    "待办与办理历史分开计数；会签个人票计办理次数，耗时忽略空值及负数。",
                    dimension("DEFINITION", "流程定义", "TEXT"), dimension("NODE", "节点", "TEXT"),
                    dimension("HANDLER", "处理人", "ID"), dimension("BUSINESS_DATE", "业务日期", "DATE"),
                    dimension("FACT_TYPE", "事实类型", "TEXT"), count("TODO_COUNT", "待办任务数"),
                    count("HANDLED_COUNT", "办理次数"), duration("DURATION_SECONDS", "办理耗时", "秒", "AVG")),
            dataset("CRM_FUNNEL", "销售漏斗", "crm", "CrmReportMapper.funnel", "crm-funnel",
                    List.of("crm:opportunity:list"), false, null,
                    "当前商机快照；金额沿源业务口径，不提供币种换算；加权金额须与预计金额×百分比赢率对账。",
                    dimension("STAGE", "阶段", "TEXT"), dimension("OWNER", "负责人", "ID"),
                    dimension("DEPARTMENT", "部门", "ID"), count("OPPORTUNITY_COUNT", "商机数"),
                    amount("EXPECTED_AMOUNT", "预计金额"), amount("WEIGHTED_AMOUNT", "加权金额")),
            dataset("CRM_AGING", "回款账龄", "crm", "CrmReportMapper.aging", "crm-aging",
                    List.of("crm:receivable:list"), false, null,
                    "查询时余额快照；账龄按查询日计算，未到期及缺到期日单列；不重建历史余额或换算币种。",
                    dimension("CUSTOMER", "客户", "ID"), dimension("OWNER", "负责人", "ID"),
                    dimension("AGING_BUCKET", "账龄段", "TEXT"), amount("PLANNED_AMOUNT", "应收金额"),
                    amount("RECEIVED_AMOUNT", "已收金额"), amount("OUTSTANDING_AMOUNT", "未收金额")),
            dataset("HR_ATTENDANCE", "考勤统计", "hr", "HrReportMapper.attendance", "hr-attendance",
                    List.of("hr:attendance:list"), true, null,
                    "按考勤日期汇总；部门是员工当前部门，不是发生时部门快照。",
                    dimension("BUSINESS_DATE", "考勤日期", "DATE"), dimension("DEPARTMENT", "当前部门", "ID"),
                    dimension("EMPLOYEE", "员工", "ID"), dimension("STATUS", "判定状态", "TEXT"),
                    count("RECORD_COUNT", "记录数"), duration("LATE_MINUTES", "迟到分钟", "分钟", "SUM", "AVG", "MIN", "MAX"),
                    duration("EARLY_MINUTES", "早退分钟", "分钟", "SUM", "AVG", "MIN", "MAX"),
                    duration("OVERTIME_MINUTES", "加班分钟", "分钟", "SUM", "AVG", "MIN", "MAX")),
            dataset("HR_LEAVE", "假期余额", "hr", "HrReportMapper.leave", "hr-leave",
                    List.of("hr:leave:list", "hr:leave:mine"), false, "UNIT",
                    "读取完整周期及冲正链；DAY与HOUR须分组或只选一个单位，缺源或循环明确失败。",
                    dimension("EMPLOYEE", "员工", "ID"), dimension("LEAVE_TYPE", "假种", "ID"),
                    dimension("UNIT", "单位", "TEXT"), dimension("PERIOD", "周期", "ID"),
                    quantity("TOTAL_QUOTA", "总配额"), quantity("USED_QUOTA", "已用量"),
                    quantity("FROZEN_QUOTA", "冻结量"), quantity("AVAILABLE_QUOTA", "可用量")),
            dataset("OA_EXPENSE", "费用执行", "oa", "OaReportMapper.expense", "oa-expense",
                    List.of("oa:expense:list"), true, null,
                    "按真实费用明细日期汇总，申请数去重；已审批金额仅APPROVED/PAID，已付款仅PAID。缺费用日期单据单列且不计入日期统计，补齐后按实际日期计入。",
                    dimension("EXPENSE_TYPE", "费用类型", "TEXT"), dimension("DEPARTMENT", "部门", "ID"),
                    dimension("BUSINESS_DATE", "费用日期", "DATE"), dimension("STATUS", "状态", "TEXT"),
                    count("CLAIM_COUNT", "申请数"), amount("CLAIM_AMOUNT", "申请金额"),
                    amount("APPROVED_AMOUNT", "已审批金额"), amount("PAID_AMOUNT", "已付款金额")),
            dataset("OA_BUDGET", "预算执行", "oa", "OaReportMapper.budget", "oa-budget",
                    List.of("oa:budget:list"), false, null,
                    "当前预算明细余额；预算期为年度与期间类型，不重复累加主单或预算流水。",
                    dimension("PERIOD", "预算期", "TEXT"), dimension("DEPARTMENT", "部门", "ID"),
                    dimension("SUBJECT", "科目", "TEXT"), amount("BUDGET_AMOUNT", "预算金额"),
                    amount("RESERVED_AMOUNT", "冻结金额"), amount("ACTUAL_AMOUNT", "执行金额"), amount("AVAILABLE_AMOUNT", "可用金额")),
            dataset("OA_ASSET", "资产台账", "oa", "OaReportMapper.assets", "oa-asset",
                    List.of("oa:asset:list"), false, null,
                    "查询时资产快照；累计折旧已包含期初，不计未入账折旧计划，不重建历史余额或换算币种。",
                    dimension("CATEGORY", "分类", "ID"), dimension("STATUS", "状态", "TEXT"),
                    dimension("DEPARTMENT", "使用部门", "ID"), dimension("CUSTODIAN", "保管人", "ID"),
                    count("ASSET_COUNT", "资产数"), amount("PURCHASE_AMOUNT", "原值"),
                    amount("DEPRECIATION_AMOUNT", "累计折旧"), amount("NET_AMOUNT", "净值")));
    private static final Map<String, ReportDataset> INDEX = DATASETS.stream()
            .collect(Collectors.toUnmodifiableMap(ReportDataset::code, Function.identity()));

    private ReportRegistry() { }

    public static List<ReportDataset> datasets() { return DATASETS; }

    public static ReportDataset require(String code) {
        ReportDataset dataset = code == null ? null : INDEX.get(code);
        if (dataset == null) throw ReportValidation.invalid("报表数据集未注册");
        return dataset;
    }

    private static ReportDataset dataset(String code, String name, String module, String mapper, String permission,
                                         List<String> sources, boolean timeBased, String partition, String description,
                                         ReportDataset.Field... fields) {
        return new ReportDataset(code, name, module, mapper, "system:report:data:" + permission,
                sources, timeBased, partition, description, List.of(fields));
    }

    private static ReportDataset.Field dimension(String code, String name, String type) {
        return new ReportDataset.Field(code, name, type, true, List.of(),
                "TEXT".equals(type) ? TEXT_OPERATORS : ORDERED_OPERATORS, null);
    }

    private static ReportDataset.Field count(String code, String name) {
        return new ReportDataset.Field(code, name, "NUMBER", false, List.of("COUNT"), List.of(), "条");
    }

    private static ReportDataset.Field amount(String code, String name) {
        return new ReportDataset.Field(code, name, "NUMBER", false, List.of("SUM"), ORDERED_OPERATORS, "源业务金额");
    }

    private static ReportDataset.Field quantity(String code, String name) {
        return new ReportDataset.Field(code, name, "NUMBER", false, List.of("SUM"), List.of(), "按单位");
    }

    private static ReportDataset.Field duration(String code, String name, String unit, String... aggregates) {
        return new ReportDataset.Field(code, name, "NUMBER", false, List.of(aggregates), ORDERED_OPERATORS, unit);
    }
}
