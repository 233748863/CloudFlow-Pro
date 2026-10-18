package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysPrintRecord;
import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.auth.printing.*;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.printing.PrintData;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Service;

/** 对象授权 → 模板选择 → 字段过滤 → 渲染 → 留痕 → 返回文件。 */
@Service
public class SysPrintService {
    private final Map<String, PrintDataProvider> providers = new LinkedHashMap<>();
    private final SysPrintTemplateService templates;
    private final SysPrintRecordService records;
    private final PrintFieldFilter fields;
    private final PrintTemplateRenderer html;
    private final PrintPdfRenderer pdf;
    private final PrintExcelRenderer excel;
    private final PrintExcelPdfRenderer excelPdf;

    public SysPrintService(List<PrintDataProvider> providers, SysPrintTemplateService templates, SysPrintRecordService records,
            PrintFieldFilter fields, PrintTemplateRenderer html, PrintPdfRenderer pdf, PrintExcelRenderer excel, PrintExcelPdfRenderer excelPdf) {
        for (PrintDataProvider provider : providers) {
            if (this.providers.putIfAbsent(provider.bizType(), provider) != null) throw new IllegalStateException("重复打印业务提供器：" + provider.bizType());
        }
        this.templates = templates; this.records = records; this.fields = fields;
        this.html = html; this.pdf = pdf; this.excel = excel; this.excelPdf = excelPdf;
    }

    public PrintOutput print(String suppliedType, Long bizId, String templateCode, String outputFormat, String ipAddress) {
        PrintContext context = context();
        PrintData data = authorizedData(suppliedType, bizId);
        String bizType = data.bizType();
        SysPrintTemplate template = templates.selectForPrint(bizType, templateCode);
        Map<String, Object> visible = fields.filter(data);
        if (visible == null) throw new ServiceException("打印字段权限校验失败", 503);
        PrintOutput output = render(template, visible, outputFormat, bizType + "-" + bizId);
        SysPrintRecord record = new SysPrintRecord();
        record.setTenantId(context.tenantId()); record.setTemplateId(template.getTemplateId()); record.setTemplateCode(template.getTemplateCode());
        record.setBizType(bizType); record.setBizId(bizId.toString()); record.setOutputFormat(output.format());
        record.setOperatorId(context.userId());
        String name = UserContext.getUserName();
        record.setOperatorName(name == null || name.isBlank() ? context.userId().toString() : name.substring(0, Math.min(64, name.length())));
        record.setPrintTime(LocalDateTime.now()); record.setCreateTime(record.getPrintTime()); record.setCreateBy(record.getOperatorName());
        record.setIpAddress(ipAddress != null && ipAddress.length() <= 45 ? ipAddress : null); record.setFileSize((long) output.bytes().length);
        records.save(record);
        return output;
    }

    public List<SysPrintTemplateService.PrintTemplateOption> options(String suppliedType, Long bizId) {
        PrintData data = authorizedData(suppliedType, bizId);
        return templates.optionsForPrint(data.bizType());
    }

    /** 示例预览只接受调用方提供的数据，不查询业务对象，也不产生业务打印记录。 */
    public PrintOutput preview(Long templateId, Map<String, Object> sample, String outputFormat) {
        if (sample == null) throw new ServiceException("请提供示例数据对象", 400);
        return render(templates.detail(templateId), sample, outputFormat, "template-preview-" + templateId);
    }

    private PrintData authorizedData(String suppliedType, Long bizId) {
        PrintContext context = context();
        String bizType = suppliedType == null ? "" : suppliedType.trim().toUpperCase(Locale.ROOT);
        PrintDataProvider provider = providers.get(bizType);
        if (provider == null || bizId == null || bizId <= 0) throw new ServiceException("打印业务或记录ID无效", 400);
        PrintData data = provider.buildData(bizId, context);
        if (data == null || !Objects.equals(data.tenantId(), context.tenantId()) || !bizType.equals(data.bizType())
                || !bizId.toString().equals(data.bizId()) || data.values() == null) throw new ServiceException("打印数据身份不匹配", 403);
        return data;
    }

    public PrintOutput render(SysPrintTemplate template, Map<String, Object> visible, String suppliedFormat, String name) {
        String format = suppliedFormat == null || suppliedFormat.isBlank() ? template.getOutputFormat() : suppliedFormat.trim().toUpperCase(Locale.ROOT);
        if (!List.of("PDF", "HTML", "EXCEL").contains(format)) throw new ServiceException("打印输出格式无效", 400);
        byte[] bytes;
        String extension;
        String contentType;
        if ("HTML".equals(template.getTemplateFormat())) {
            if ("EXCEL".equals(format)) throw new ServiceException("HTML 模板不支持 Excel 输出", 400);
            String rendered = html.render(template.getTemplateContent(), visible);
            bytes = "PDF".equals(format) ? pdf.render(rendered, template) : safeHtml(rendered).getBytes(StandardCharsets.UTF_8);
            extension = "PDF".equals(format) ? "pdf" : "html";
            contentType = "PDF".equals(format) ? "application/pdf" : "text/html;charset=UTF-8";
        } else if ("EXCEL".equals(template.getTemplateFormat())) {
            if ("HTML".equals(format)) throw new ServiceException("Excel 模板不支持 HTML 输出", 400);
            byte[] filled = excel.render(templates.readExcel(template), visible);
            boolean xls = filled.length >= 4 && filled[0] == (byte) 0xD0 && filled[1] == (byte) 0xCF;
            bytes = "PDF".equals(format) ? excelPdf.render(filled, template) : filled;
            extension = "PDF".equals(format) ? "pdf" : xls ? "xls" : "xlsx";
            contentType = "PDF".equals(format) ? "application/pdf" : xls ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        } else throw new ServiceException("打印模板格式无效", 400);
        return new PrintOutput(bytes, name + "." + extension, contentType, format);
    }

    private String safeHtml(String source) {
        Safelist safe = Safelist.relaxed().addTags("style").addAttributes(":all", "style", "class", "id");
        Document document = Jsoup.parse(Jsoup.clean(source, safe));
        document.select("a,img").forEach(element -> { element.removeAttr("href"); element.removeAttr("src"); });
        document.head().prependElement("meta").attr("charset", "UTF-8");
        document.head().prependElement("meta").attr("http-equiv", "Content-Security-Policy")
                .attr("content", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
        return document.outerHtml();
    }

    private PrintContext context() {
        if (UserContext.getTenantId() == null || UserContext.getUserId() == null) throw new ServiceException("缺少当前用户或租户", 403);
        return new PrintContext(UserContext.getTenantId(), UserContext.getUserId());
    }

    public record PrintOutput(byte[] bytes, String filename, String contentType, String format) { }
}
