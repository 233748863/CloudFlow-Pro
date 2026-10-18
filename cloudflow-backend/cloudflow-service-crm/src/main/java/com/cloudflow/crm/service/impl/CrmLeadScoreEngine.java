package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmLeadScoreRule;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public final class CrmLeadScoreEngine {
    public static final Set<String> FIELDS = Set.of("annual_revenue", "employee_scale", "market_segment", "territory_id",
            "industry", "source", "job_title", "website", "company_name", "email", "mobile");
    public static final Set<String> OPERATORS = Set.of("=", "!=", ">", ">=", "<", "<=", "IN", "NOT_IN", "CONTAINS", "IS_EMPTY", "IS_NOT_EMPTY");
    private static final Set<String> NUMERIC = Set.of("annual_revenue", "territory_id");
    private CrmLeadScoreEngine() { }

    public static void validate(CrmLeadScoreRule rule) {
        if (rule.getFieldName() == null || rule.getOperator() == null
                || !FIELDS.contains(rule.getFieldName()) || !OPERATORS.contains(rule.getOperator())) throw new CrmBusinessException("评分字段或运算符不在白名单内");
        if (rule.getScore() == null) throw new CrmBusinessException("评分分值不能为空");
        if (Set.of("IS_EMPTY", "IS_NOT_EMPTY").contains(rule.getOperator())) return;
        CrmRecordSupport.text(rule.getFieldValue(), 500, "比较值");
        if (Set.of(">", ">=", "<", "<=").contains(rule.getOperator()) && !NUMERIC.contains(rule.getFieldName())) throw new CrmBusinessException("大小比较仅支持数值字段");
        if (NUMERIC.contains(rule.getFieldName())) {
            if ("CONTAINS".equals(rule.getOperator())) throw new CrmBusinessException("数值字段不支持包含比较");
            try { values(rule).forEach(BigDecimal::new); } catch (NumberFormatException exception) { throw new CrmBusinessException("数值比较值格式无效"); }
        }
    }

    public static int calculate(CrmLead lead, List<CrmLeadScoreRule> rules) {
        int score = 0;
        for (CrmLeadScoreRule rule : rules) {
            if (!Integer.valueOf(1).equals(rule.getEnabledFlag())) continue;
            validate(rule);
            if (matches(lead, rule)) {
                try { score = Math.addExact(score, rule.getScore()); }
                catch (ArithmeticException exception) { throw new CrmBusinessException("累计评分超出整数范围，请调整规则"); }
            }
        }
        return score;
    }

    public static boolean matches(CrmLead lead, CrmLeadScoreRule rule) {
        Object actual = switch (rule.getFieldName()) {
            case "annual_revenue" -> lead.getAnnualRevenue(); case "employee_scale" -> lead.getEmployeeScale();
            case "market_segment" -> lead.getMarketSegment(); case "territory_id" -> lead.getTerritoryId();
            case "industry" -> lead.getIndustry(); case "source" -> lead.getSource(); case "job_title" -> lead.getJobTitle();
            case "website" -> lead.getWebsite(); case "company_name" -> lead.getCompanyName(); case "email" -> lead.getEmail();
            case "mobile" -> lead.getMobile(); default -> throw new CrmBusinessException("评分字段无效");
        };
        boolean empty = actual == null || String.valueOf(actual).isBlank();
        if ("IS_EMPTY".equals(rule.getOperator())) return empty;
        if ("IS_NOT_EMPTY".equals(rule.getOperator())) return !empty;
        if (empty) return false;
        String value = String.valueOf(actual);
        if ("CONTAINS".equals(rule.getOperator())) return value.toLowerCase(Locale.ROOT).contains(rule.getFieldValue().toLowerCase(Locale.ROOT));
        boolean numeric = NUMERIC.contains(rule.getFieldName());
        if (Set.of("IN", "NOT_IN").contains(rule.getOperator())) {
            boolean contains = values(rule).stream().anyMatch(expected -> compare(value, expected, numeric) == 0);
            return "IN".equals(rule.getOperator()) == contains;
        }
        int comparison = compare(value, rule.getFieldValue(), numeric);
        return switch (rule.getOperator()) {
            case "=" -> comparison == 0; case "!=" -> comparison != 0; case ">" -> comparison > 0;
            case ">=" -> comparison >= 0; case "<" -> comparison < 0; case "<=" -> comparison <= 0;
            default -> throw new CrmBusinessException("评分运算符无效");
        };
    }

    private static int compare(String actual, String expected, boolean numeric) {
        return numeric ? new BigDecimal(actual).compareTo(new BigDecimal(expected.trim())) : actual.compareToIgnoreCase(expected.trim());
    }
    private static List<String> values(CrmLeadScoreRule rule) {
        return Set.of("IN", "NOT_IN").contains(rule.getOperator()) ? Arrays.stream(rule.getFieldValue().split(",", -1)).map(String::trim).toList() : List.of(rule.getFieldValue());
    }
}
