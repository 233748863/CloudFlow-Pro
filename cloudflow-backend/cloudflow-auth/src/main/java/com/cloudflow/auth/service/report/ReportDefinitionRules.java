package com.cloudflow.auth.service.report;

import com.cloudflow.auth.domain.report.ReportDefinitionInput;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportValidation;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class ReportDefinitionRules {
    private ReportDefinitionRules() { }

    public static Long id(String input) {
        if (input == null || !input.matches("[1-9][0-9]{0,18}")) throw ReportValidation.invalid("报表编号无效");
        try { return Long.valueOf(input); }
        catch (NumberFormatException exception) { throw ReportValidation.invalid("报表编号超出范围"); }
    }

    public static int version(Integer version) {
        if (version == null || version < 0) throw ReportValidation.invalid("缺少有效的报表版本");
        return version;
    }

    public static String name(String input, int length) {
        if (input == null || input.isBlank() || input.codePointCount(0, input.length()) > length
                || input.codePoints().anyMatch(Character::isISOControl)) throw ReportValidation.invalid("名称为空、过长或包含控制字符");
        return input.trim();
    }

    public static ReportDefinitionInput.Style style(ReportDefinitionInput.Style input) {
        String palette = input == null || input.palette() == null ? "PRIMARY" : input.palette();
        if (!List.of("PRIMARY", "SUCCESS", "WARNING", "NEUTRAL").contains(palette)) throw ReportValidation.invalid("图表只能使用注册的语义配色");
        return new ReportDefinitionInput.Style(palette, input == null || !Boolean.FALSE.equals(input.showLegend()),
                input != null && Boolean.TRUE.equals(input.showValues()));
    }

    public static void chartType(String type, ReportQuery query) {
        if (type == null || !List.of("BAR", "LINE", "PIE", "FUNNEL", "TABLE", "METRIC").contains(type)) throw ReportValidation.invalid("图表类型未注册");
        int dimensions = query.dimensions() == null ? 0 : query.dimensions().size();
        if ("METRIC".equals(type) && (dimensions != 0 || query.measures().size() != 1)) throw ReportValidation.invalid("指标卡须为一个度量且不分组");
        if (List.of("PIE", "FUNNEL").contains(type) && (dimensions != 1 || query.measures().size() != 1)) throw ReportValidation.invalid("饼图和漏斗图须选择一个维度及一个度量");
        if (List.of("BAR", "LINE").contains(type) && dimensions == 0) throw ReportValidation.invalid("柱状图和折线图至少选择一个维度");
    }

    public static List<ReportDefinitionInput.Item> layout(List<ReportDefinitionInput.Item> input) {
        if (input == null || input.size() > 30) throw ReportValidation.invalid("仪表盘布局必填且最多30张图表");
        Set<Long> identifiers = new HashSet<>();
        for (ReportDefinitionInput.Item item : input) {
            if (item == null || !identifiers.add(id(item.chartId())) || item.gridX() == null || item.gridY() == null
                    || item.gridW() == null || item.gridH() == null || item.gridX() < 0 || item.gridX() > 11
                    || item.gridY() < 0 || item.gridY() > 1000 || item.gridW() < 1 || item.gridW() > 12
                    || item.gridH() < 1 || item.gridH() > 100 || item.gridX() + item.gridW() > 12) throw ReportValidation.invalid("仪表盘图表引用重复或网格范围无效");
        }
        for (int leftIndex = 0; leftIndex < input.size(); leftIndex++) {
            ReportDefinitionInput.Item left = input.get(leftIndex);
            for (int rightIndex = leftIndex + 1; rightIndex < input.size(); rightIndex++) {
                ReportDefinitionInput.Item right = input.get(rightIndex);
                if (left.gridX() < right.gridX() + right.gridW() && right.gridX() < left.gridX() + left.gridW()
                        && left.gridY() < right.gridY() + right.gridH() && right.gridY() < left.gridY() + left.gridH()) {
                    throw ReportValidation.invalid("仪表盘图表网格不能重叠");
                }
            }
        }
        return List.copyOf(input);
    }
}
