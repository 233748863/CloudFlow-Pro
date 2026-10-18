package com.cloudflow.auth.service.report;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.report.ReportDefinitionInput;
import com.cloudflow.auth.domain.report.ReportDefinitionView;
import com.cloudflow.auth.domain.report.SysReportChart;
import com.cloudflow.auth.domain.report.SysReportDashboard;
import com.cloudflow.auth.domain.report.SysReportDashboardItem;
import com.cloudflow.auth.domain.report.SysReportDataset;
import com.cloudflow.auth.mapper.report.SysReportChartMapper;
import com.cloudflow.auth.mapper.report.SysReportDashboardItemMapper;
import com.cloudflow.auth.mapper.report.SysReportDashboardMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.security.report.ReportAccess;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ReportDefinitionService {
    private final SysReportChartMapper charts;
    private final SysReportDashboardMapper dashboards;
    private final SysReportDashboardItemMapper items;
    private final ReportDatasetService datasets;
    private final ObjectMapper objectMapper;

    public PageResult<ReportDefinitionView.Chart> chartList(int pageNum, int pageSize) {
        context("system:report:chart:list");
        Page<SysReportChart> page = charts.visible(page(pageNum, pageSize), tenant(), user(), UserContext.getDeptId());
        return new PageResult<>(page.getRecords().stream().map(this::chartView).toList(), page.getTotal(), pageNum, pageSize);
    }

    public ReportDefinitionView.Chart chart(String id) {
        context("system:report:chart:list");
        return chartView(visibleChart(ReportDefinitionRules.id(id)));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存本人报表图表", spel = "#input", diff = true)
    public Long saveChart(ReportDefinitionInput.Chart input) {
        context("system:report:chart:save");
        if (input == null) throw ReportValidation.invalid("图表配置不能为空");
        SysReportDataset dataset = datasets.require(input.datasetCode());
        PreparedReportQuery query = ReportValidation.prepare(ReportRegistry.require(input.datasetCode()), input.query(), LocalDate.now());
        ReportDefinitionRules.chartType(input.type(), input.query());
        ReportDefinitionInput.Style style = ReportDefinitionRules.style(input.style());
        boolean creating = input.chartId() == null;
        SysReportChart record = creating ? new SysReportChart() : charts.lockById(tenant(), ReportDefinitionRules.id(input.chartId()));
        if (creating) {
            if (input.version() != null && input.version() != 0) throw ReportValidation.invalid("新增图表不能指定已有版本");
            record.setTenantId(tenant()); record.setOwnerId(user()); record.setOwnerDeptId(department());
            record.setShareScope("PRIVATE"); record.setDeleted(0); record.setVersion(0);
        } else { owned(record == null ? null : record.getOwnerId()); requireVersion(record.getVersion(), input.version()); }
        record.setChartName(ReportDefinitionRules.name(input.name(), 100)); record.setChartType(input.type()); record.setDatasetId(dataset.getDatasetId());
        record.setDimensions(json(query.dimensions())); record.setMeasures(json(query.measures()));
        record.setFilters(json(new SavedFilters(input.query().filters(), input.query().startDate(), input.query().endDate())));
        record.setSortConfig(json(query.sorts())); record.setLimitRows(query.limitRows()); record.setStyleConfig(json(style)); record.setUpdateBy(actor());
        if (creating) { record.setCreateBy(actor()); charts.insert(record); }
        else changed(charts.writeDefinition(record, input.version()));
        return record.getChartId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除本人报表图表", highRisk = true, spel = "#id")
    public void removeChart(String id, Integer version) {
        context("system:report:chart:remove");
        Long chartId = ReportDefinitionRules.id(id);
        SysReportChart record = charts.lockById(tenant(), chartId);
        owned(record == null ? null : record.getOwnerId()); requireVersion(record.getVersion(), version);
        if (charts.referenceCount(tenant(), chartId) > 0) throw new ServiceException("图表仍被仪表盘引用，请先移除引用；也可撤回共享", 409);
        changed(charts.removeDefinition(tenant(), chartId, user(), version, actor()));
    }

    public PageResult<ReportDefinitionView.Dashboard> dashboardList(int pageNum, int pageSize) {
        context("system:report:dashboard:list");
        Page<SysReportDashboard> page = dashboards.visible(page(pageNum, pageSize), tenant(), user(), UserContext.getDeptId());
        return new PageResult<>(page.getRecords().stream().map(record -> dashboardView(record, false)).toList(), page.getTotal(), pageNum, pageSize);
    }

    public ReportDefinitionView.Dashboard dashboard(String id) {
        context("system:report:dashboard:list");
        SysReportDashboard record = dashboards.visibleById(tenant(), ReportDefinitionRules.id(id), user(), UserContext.getDeptId());
        if (record == null) throw missing();
        return dashboardView(record, true);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存本人报表仪表盘", spel = "#input", diff = true)
    public Long saveDashboard(ReportDefinitionInput.Dashboard input) {
        context("system:report:dashboard:save");
        if (input == null) throw ReportValidation.invalid("仪表盘配置不能为空");
        List<ReportDefinitionInput.Item> layout = ReportDefinitionRules.layout(input.items());
        if (input.remark() != null && input.remark().codePointCount(0, input.remark().length()) > 500) throw ReportValidation.invalid("说明最多500字");
        for (Long chartId : layout.stream().map(item -> ReportDefinitionRules.id(item.chartId())).sorted().toList()) {
            SysReportChart chart = charts.lockById(tenant(), chartId);
            if (chart == null || !visible(chart.getOwnerId(), chart.getOwnerDeptId(), chart.getShareScope())) throw missing();
            SysReportDataset dataset = datasets.forDefinition(chart.getDatasetId());
            datasets.require(dataset.getDatasetCode());
        }
        boolean creating = input.dashboardId() == null;
        SysReportDashboard record = creating ? new SysReportDashboard() : dashboards.lockById(tenant(), ReportDefinitionRules.id(input.dashboardId()));
        if (creating) {
            if (input.version() != null && input.version() != 0) throw ReportValidation.invalid("新增仪表盘不能指定已有版本");
            record.setTenantId(tenant()); record.setOwnerId(user()); record.setOwnerDeptId(department());
            record.setShareScope("PRIVATE"); record.setDeleted(0); record.setVersion(0); record.setCreateBy(actor());
        } else { owned(record == null ? null : record.getOwnerId()); requireVersion(record.getVersion(), input.version()); }
        record.setDashboardName(ReportDefinitionRules.name(input.name(), 100)); record.setRemark(input.remark()); record.setUpdateBy(actor());
        if (creating) dashboards.insert(record);
        else changed(dashboards.writeDefinition(record, input.version()));
        items.clearLayout(tenant(), record.getDashboardId());
        for (ReportDefinitionInput.Item item : layout) {
            SysReportDashboardItem row = new SysReportDashboardItem();
            row.setTenantId(tenant()); row.setDashboardId(record.getDashboardId()); row.setChartId(ReportDefinitionRules.id(item.chartId()));
            row.setGridX(item.gridX()); row.setGridY(item.gridY()); row.setGridW(item.gridW()); row.setGridH(item.gridH());
            row.setCreateBy(actor()); row.setUpdateBy(actor()); items.insert(row);
        }
        return record.getDashboardId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除本人报表仪表盘", highRisk = true, spel = "#id")
    public void removeDashboard(String id, Integer version) {
        context("system:report:dashboard:remove");
        Long dashboardId = ReportDefinitionRules.id(id);
        SysReportDashboard record = dashboards.lockById(tenant(), dashboardId);
        owned(record == null ? null : record.getOwnerId()); requireVersion(record.getVersion(), version);
        changed(dashboards.removeDefinition(tenant(), dashboardId, user(), version, actor()));
        items.clearLayout(tenant(), dashboardId);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "调整本人报表定义共享范围", highRisk = true, spel = "#input", diff = true)
    public void share(ReportDefinitionInput.Share input) {
        context("system:report:share");
        if (input == null || input.kind() == null || input.scope() == null
                || !List.of("CHART", "DASHBOARD").contains(input.kind()) || !List.of("PRIVATE", "DEPT", "TENANT").contains(input.scope())) {
            throw ReportValidation.invalid("共享对象或共享范围无效");
        }
        Long id = ReportDefinitionRules.id(input.id());
        int version = ReportDefinitionRules.version(input.version());
        if ("CHART".equals(input.kind())) {
            SysReportChart record = charts.lockById(tenant(), id);
            owned(record == null ? null : record.getOwnerId()); requireVersion(record.getVersion(), version);
            changed(charts.writeSharing(tenant(), id, user(), input.scope(), version, actor()));
        } else {
            SysReportDashboard record = dashboards.lockById(tenant(), id);
            owned(record == null ? null : record.getOwnerId()); requireVersion(record.getVersion(), version);
            changed(dashboards.writeSharing(tenant(), id, user(), input.scope(), version, actor()));
        }
    }

    private SysReportChart visibleChart(Long id) {
        SysReportChart record = charts.visibleById(tenant(), id, user(), UserContext.getDeptId());
        if (record == null) throw missing();
        return record;
    }

    private ReportDefinitionView.Chart chartView(SysReportChart record) {
        SysReportDataset dataset = datasets.forDefinition(record.getDatasetId());
        ReportDataset definition = ReportRegistry.require(dataset.getDatasetCode());
        SavedFilters filters = parse(record.getFilters(), new TypeReference<SavedFilters>() { });
        ReportQuery query = new ReportQuery(parse(record.getDimensions(), new TypeReference<List<String>>() { }),
                parse(record.getMeasures(), new TypeReference<List<ReportQuery.Measure>>() { }), filters == null ? null : filters.predicate(),
                parse(record.getSortConfig(), new TypeReference<List<ReportQuery.Sort>>() { }), record.getLimitRows(),
                filters == null ? null : filters.startDate(), filters == null ? null : filters.endDate());
        ReportValidation.prepare(definition, query, LocalDate.now());
        ReportDefinitionRules.chartType(record.getChartType(), query);
        ReportDefinitionInput.Style style = ReportDefinitionRules.style(parse(record.getStyleConfig(), new TypeReference<ReportDefinitionInput.Style>() { }));
        return new ReportDefinitionView.Chart(record.getChartId(), record.getVersion(), record.getChartName(), record.getChartType(),
                definition.code(), query, style, record.getOwnerId(), record.getShareScope(),
                Objects.equals(record.getOwnerId(), user()), datasets.availability(dataset, definition));
    }

    private ReportDefinitionView.Dashboard dashboardView(SysReportDashboard record, boolean includeItems) {
        List<ReportDefinitionView.Item> views = new ArrayList<>();
        if (includeItems) {
            for (SysReportDashboardItem item : items.forDashboard(tenant(), record.getDashboardId())) {
                SysReportChart chart = charts.visibleById(tenant(), item.getChartId(), user(), UserContext.getDeptId());
                ReportDefinitionView.Chart definition = null;
                String availability = "NO_DEFINITION_ACCESS";
                if (chart != null) {
                    try { definition = chartView(chart); availability = definition.availability(); }
                    catch (ServiceException exception) {
                        if (!List.of(400, 404, 409, 503).contains(exception.getCode())) throw exception;
                        availability = "INVALID_CONFIGURATION";
                    }
                }
                views.add(new ReportDefinitionView.Item(item.getChartId(), item.getGridX(), item.getGridY(), item.getGridW(), item.getGridH(), definition, availability));
            }
        }
        return new ReportDefinitionView.Dashboard(record.getDashboardId(), record.getVersion(), record.getDashboardName(), record.getRemark(),
                record.getOwnerId(), record.getShareScope(), Objects.equals(record.getOwnerId(), user()), List.copyOf(views));
    }

    private <Value> Value parse(String value, TypeReference<Value> type) {
        if (value == null) return null;
        try { return ReportValidation.strictReader(objectMapper, objectMapper.constructType(type)).readValue(value); }
        catch (JsonProcessingException exception) { throw new ServiceException("已保存的报表配置无效，请核对定义", 409); }
    }

    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new ServiceException("报表定义保存失败", 500); }
    }

    private static <Value> Page<Value> page(int number, int size) {
        if (number < 1 || number > 100000 || size < 1 || size > 50) throw ReportValidation.invalid("分页参数无效，每页最多50条");
        return new Page<>(number, size);
    }

    private static void context(String permission) { ReportAccess.requireContext(); StpUtil.checkPermission(permission); }
    private static Long tenant() { return UserContext.getTenantId(); }
    private static Long user() { return UserContext.getUserId(); }
    private static String actor() { return Objects.toString(UserContext.getUserName(), ""); }
    private static Long department() {
        Long department = UserContext.getDeptId();
        if (department == null || department <= 0) throw ReportValidation.invalid("请先配置所属部门，再创建报表");
        return department;
    }
    private static boolean visible(Long owner, Long department, String scope) {
        return Objects.equals(owner, user()) || "TENANT".equals(scope)
                || "DEPT".equals(scope) && department != null && Objects.equals(department, UserContext.getDeptId());
    }
    private static void owned(Long owner) { if (owner == null || !Objects.equals(owner, user())) throw missing(); }
    private static void requireVersion(Integer actual, Integer expected) {
        ReportDefinitionRules.version(expected);
        if (!Objects.equals(actual, expected)) throw new ServiceException("报表已被其他操作修改，请刷新后再试", 409);
    }
    private static void changed(int count) { if (count != 1) throw new ServiceException("报表已被其他操作修改，请刷新后再试", 409); }
    private static ServiceException missing() { return new ServiceException("报表不存在或无权访问", 404); }

    public record SavedFilters(ReportQuery.FilterGroup predicate, String startDate, String endDate) { }
}
