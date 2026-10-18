package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrSalarySlip;
import lombok.RequiredArgsConstructor;
import org.jsoup.nodes.Entities;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class HrSalarySlipPrintService {
    private final HrPdfRenderer renderer;
    private final HrRuleSupport support;

    public ResponseEntity<byte[]> response(HrSalarySlip slip) {
        StringBuilder html = new StringBuilder("""
                <html><head><meta charset="UTF-8" />
                <style>
                  body { font-family: "Noto Sans SC", sans-serif; }
                  table { width: 100%; border-collapse: collapse; }
                  th, td { text-align: left; padding: 4pt 8pt; }
                  .amount { text-align: right; white-space: nowrap; }
                </style>
                </head><body><h1>工资明细</h1>
                """);
        html.append(renderer.fillTemplate("<p>工资月份：{{month}}　员工编号：{{employeeId}}</p><p>应发：{{gross}}　扣除：{{deduction}}　实发：{{net}}</p>",
                Map.of("month", slip.getPeriodMonth(), "employeeId", slip.getEmployeeId(), "gross", slip.getGrossTotal(), "deduction", slip.getDeductionTotal(), "net", slip.getNetTotal())));
        html.append("<table><thead><tr><th>项目</th><th class=\"amount\">金额</th></tr></thead><tbody>");
        if (slip.getComponents() != null) for (Map<String, Object> component : slip.getComponents()) {
            if (!"EARNING".equals(component.get("type")) && !"DEDUCTION".equals(component.get("type"))) continue;
            String name = componentName(component);
            BigDecimal amount = new BigDecimal(String.valueOf(component.get("amount")));
            html.append("<tr><td>").append(Entities.escape(name))
                    .append("</td><td class=\"amount\">").append(amount.setScale(2, RoundingMode.HALF_UP).toPlainString()).append("</td></tr>");
        }
        html.append("</tbody></table></body></html>");
        byte[] pdf = renderer.render(html.toString());
        support.audit("SALARY_SLIP", slip.getId(), "EXPORT_PDF", Map.of("employeeId", slip.getEmployeeId()));
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=salary-slip-" + slip.getId() + ".pdf").body(pdf);
    }

    private String componentName(Map<String, Object> component) {
        Object savedName = component.get("salaryComponentName");
        if (savedName instanceof String text && !text.isBlank()) return text;
        String name = String.valueOf(component.get("name"));
        if (!"COMPENSATION_CHANGE".equals(component.get("sourceType"))) return name;
        return switch (name) {
            case "BONUS" -> "奖金";
            case "OVERTIME" -> "加班费";
            case "REFERRAL_BONUS" -> "内推奖金";
            case "LEAVE_ENCASHMENT" -> "假期折现";
            default -> name;
        };
    }
}
