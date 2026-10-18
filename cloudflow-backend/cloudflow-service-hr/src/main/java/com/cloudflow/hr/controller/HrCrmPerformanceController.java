package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.CrmPerformanceClient;
import com.cloudflow.hr.client.vo.CrmPerformanceSummaryVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.function.Supplier;

/**
 * HR 绩效看板的"销售业绩"区块：代理 CRM 侧 /inner/crm/performance/**。
 * 网关挂到 /hr/performance/crm/*，前端可直接调。
 */
@Slf4j
@RestController
@RequestMapping("/performance/crm")
@RequiredArgsConstructor
public class HrCrmPerformanceController {

    private final CrmPerformanceClient crmPerformanceClient;

    @GetMapping("/owners")
    @SaCheckPermission("hr:performance:view")
    public R<List<CrmPerformanceSummaryVO>> summarizeByOwner(
            @RequestParam(value = "ownerIds", required = false) List<Long> ownerIds,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate,
            @RequestParam(value = "calculationBasis", defaultValue = "OWNER_V1") String calculationBasis,
            @RequestParam(value = "currency", defaultValue = "CNY") String currency) {
        return query(ownerIds, startDate, endDate, calculationBasis, currency, null,
                () -> crmPerformanceClient.summarizeByOwner(ownerIds, startDate, endDate, calculationBasis, currency));
    }

    @GetMapping("/depts")
    @SaCheckPermission("hr:performance:view")
    public R<List<CrmPerformanceSummaryVO>> summarizeByDept(
            @RequestParam(value = "deptIds", required = false) List<Long> deptIds,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate,
            @RequestParam(value = "calculationBasis", defaultValue = "OWNER_V1") String calculationBasis,
            @RequestParam(value = "currency", defaultValue = "CNY") String currency) {
        return query(deptIds, startDate, endDate, calculationBasis, currency, null,
                () -> crmPerformanceClient.summarizeByDept(deptIds, startDate, endDate, calculationBasis, currency));
    }

    @GetMapping("/top-owners")
    @SaCheckPermission("hr:performance:view")
    public R<List<CrmPerformanceSummaryVO>> topOwners(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate,
            @RequestParam(value = "calculationBasis", defaultValue = "OWNER_V1") String calculationBasis,
            @RequestParam(value = "currency", defaultValue = "CNY") String currency) {
        return query(null, startDate, endDate, calculationBasis, currency, limit,
                () -> crmPerformanceClient.topOwners(limit, startDate, endDate, calculationBasis, currency));
    }

    @GetMapping("/top-depts")
    @SaCheckPermission("hr:performance:view")
    public R<List<CrmPerformanceSummaryVO>> topDepartments(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate,
            @RequestParam(value = "calculationBasis", defaultValue = "OWNER_V1") String calculationBasis,
            @RequestParam(value = "currency", defaultValue = "CNY") String currency) {
        return query(null, startDate, endDate, calculationBasis, currency, limit,
                () -> crmPerformanceClient.topDepartments(limit, startDate, endDate, calculationBasis, currency));
    }

    private static R<List<CrmPerformanceSummaryVO>> query(List<Long> targetIds, String startDate, String endDate,
            String calculationBasis, String currency, Integer limit, Supplier<R<List<CrmPerformanceSummaryVO>>> request) {
        if (targetIds != null && (targetIds.size() > 200 || targetIds.stream().anyMatch(identifier -> identifier == null || identifier <= 0))) {
            return R.fail(400, "一次销售业绩查询最多指定200个有效对象");
        }
        if (limit != null && (limit < 1 || limit > 200)) return R.fail(400, "销售业绩排行数量须在1至200之间");
        if (calculationBasis != null && !List.of("OWNER_V1", "TEAM_V2").contains(calculationBasis)) {
            return R.fail(400, "销售业绩统计方式须为负责人旧口径或团队分成");
        }
        if (currency != null && !currency.matches("[A-Z]{3}")) return R.fail(400, "币种须为三个大写字母");
        LocalDate start;
        LocalDate end;
        try {
            start = date(startDate);
            end = date(endDate);
        } catch (DateTimeParseException invalidDate) {
            return R.fail(400, "销售业绩日期须为1000至9999年内的有效日期");
        }
        if (start != null && end != null && start.isAfter(end)) return R.fail(400, "销售业绩起始日期不能晚于结束日期");
        return request.get();
    }

    private static LocalDate date(String value) {
        if (value == null || value.isBlank()) return null;
        if (!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new DateTimeParseException("Invalid date", value, 0);
        LocalDate date = LocalDate.parse(value);
        if (date.getYear() < 1000 || date.getYear() > 9999) throw new DateTimeParseException("Invalid year", value, 0);
        return date;
    }
}
