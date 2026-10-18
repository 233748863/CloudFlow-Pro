package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.auth.domain.dto.PrintTemplateDTO;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.mapper.SysPrintTemplateMapper;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** 模板维护及统一打印使用的受控模板读取。 */
@Service
@RequiredArgsConstructor
public class SysPrintTemplateService {
    private final SysPrintTemplateMapper mapper;
    private final SysFileMapper fileMapper;
    private final ISysFileService fileService;
    private final FileStorageRegistry storageRegistry;
    private final ObjectMapper json;

    public PageResult<SysPrintTemplate> list(String code, String bizType, String status, int pageNum, int pageSize) {
        LambdaQueryWrapper<SysPrintTemplate> query = scope(tenantId())
                .select(SysPrintTemplate.class, field -> !List.of("template_content", "variables_declare").contains(field.getColumn()))
                .like(trim(code) != null, SysPrintTemplate::getTemplateCode, trim(code))
                .eq(trim(bizType) != null, SysPrintTemplate::getBizType, upper(bizType))
                .eq(trim(status) != null, SysPrintTemplate::getStatus, upper(status))
                .orderByDesc(SysPrintTemplate::getDefaultFlag).orderByDesc(SysPrintTemplate::getTemplateId);
        Page<SysPrintTemplate> page = mapper.selectPage(new Page<>(Math.max(1, pageNum), Math.max(1, Math.min(200, pageSize))), query);
        return new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public SysPrintTemplate detail(Long id) {
        return require(id, tenantId());
    }

    /** 业务用户只读取启用模板的展示信息，不向其返回模板正文或私有附件。 */
    public List<PrintTemplateOption> optionsForPrint(String bizType) {
        return mapper.selectList(scope(tenantId()).eq(SysPrintTemplate::getBizType, bizType)
                .eq(SysPrintTemplate::getStatus, "ENABLED")
                .select(SysPrintTemplate::getTemplateId, SysPrintTemplate::getTemplateCode, SysPrintTemplate::getTemplateName,
                        SysPrintTemplate::getTemplateFormat, SysPrintTemplate::getOutputFormat, SysPrintTemplate::getDefaultFlag)
                .orderByDesc(SysPrintTemplate::getDefaultFlag).orderByAsc(SysPrintTemplate::getTemplateId))
                .stream().map(row -> new PrintTemplateOption(row.getTemplateCode(), row.getTemplateName(),
                        row.getTemplateFormat(), row.getOutputFormat(), row.getDefaultFlag())).toList();
    }

    public record PrintTemplateOption(String templateCode, String templateName, String templateFormat, String outputFormat, Integer defaultFlag) { }

    public SysPrintTemplate selectForPrint(String bizType, String code) {
        LambdaQueryWrapper<SysPrintTemplate> query = scope(tenantId())
                .eq(SysPrintTemplate::getBizType, bizType).eq(SysPrintTemplate::getStatus, "ENABLED");
        if (trim(code) == null) query.eq(SysPrintTemplate::getDefaultFlag, 1);
        else query.eq(SysPrintTemplate::getTemplateCode, required(code, 50, "模板编码"));
        List<SysPrintTemplate> matches = mapper.selectList(query);
        if (matches.isEmpty()) throw new ServiceException("未找到启用的打印模板，请先配置模板", 404);
        if (matches.size() != 1) throw new ServiceException("打印模板配置冲突，请联系管理员", 409);
        return matches.get(0);
    }

    public byte[] readExcel(SysPrintTemplate template) {
        Long tenant = tenantId();
        if (template == null || !tenant.equals(template.getTenantId())
                || !"EXCEL".equals(template.getTemplateFormat())) throw new ServiceException("模板附件无权访问", 403);
        SysFile file = requireFile(fileId(template.getTemplateFileUrl()), template, tenant);
        try (InputStream input = storageRegistry.getForFile(file).open(file.getFilePath())) {
            byte[] bytes = input.readNBytes(10485761);
            if (bytes.length > 10485760) throw new ServiceException("Excel 模板不能超过10485760字节", 400);
            return bytes;
        } catch (IOException failure) { throw new ServiceException("模板文件读取失败", 503); }
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存打印模板", highRisk = true)
    public SysPrintTemplate save(PrintTemplateDTO dto, MultipartFile upload, boolean creating) {
        Long tenant = tenantId();
        lockTenant(tenant);
        if (dto == null || (creating ? dto.getTemplateId() != null : dto.getTemplateId() == null)) {
            throw new ServiceException("模板ID与操作不匹配", 400);
        }
        SysPrintTemplate previous = creating ? null : require(dto.getTemplateId(), tenant);
        if (previous != null && !Objects.equals(previous.getVersion(), dto.getVersion())) {
            throw new ServiceException("模板已被修改，请刷新后重试", 409);
        }
        SysPrintTemplate next = normalize(dto);
        next.setTemplateId(creating ? null : previous.getTemplateId());
        next.setTenantId(tenant);
        next.setDeleted(0);
        next.setVersion(creating ? 0 : Math.addExact(previous.getVersion(), 1));
        next.setUpdateBy(operator());
        next.setUpdateTime(LocalDateTime.now());
        if (mapper.countCode(tenant, next.getTemplateCode(), next.getTemplateId()) > 0) {
            throw new ServiceException("模板编码已使用（含已删除模板），请更换编码", 409);
        }
        SysFile uploaded = null;
        if ("EXCEL".equals(next.getTemplateFormat())) {
            if (upload != null && !upload.isEmpty()) {
                String name = upper(upload.getOriginalFilename());
                if (name == null || !(name.endsWith(".XLSX") || name.endsWith(".XLS"))) {
                    throw new ServiceException("请选择 Excel 模板文件（xls/xlsx）", 400);
                }
                uploaded = fileService.uploadFile(upload);
                if (!tenant.equals(uploaded.getTenantId()) || !Integer.valueOf(0).equals(uploaded.getDeleted())) {
                    throw new ServiceException("模板附件租户无效", 403);
                }
                next.setTemplateFileUrl(reference(uploaded.getFileId()));
            } else {
                if (previous == null || !"EXCEL".equals(previous.getTemplateFormat())
                        || !Objects.equals(previous.getTemplateFileUrl(), next.getTemplateFileUrl())) {
                    throw new ServiceException("请上传 Excel 模板文件", 400);
                }
                requireFile(fileId(next.getTemplateFileUrl()), previous, tenant);
            }
        } else if (upload != null && !upload.isEmpty()) {
            throw new ServiceException("HTML 模板请填写或导入文本内容", 400);
        }
        if (creating) {
            next.setCreateBy(operator());
            next.setCreateTime(next.getUpdateTime());
            if (mapper.insert(next) != 1) throw new ServiceException("模板保存失败");
        } else if (mapper.update(next, new LambdaUpdateWrapper<SysPrintTemplate>()
                .eq(SysPrintTemplate::getTemplateId, next.getTemplateId()).eq(SysPrintTemplate::getTenantId, tenant)
                .eq(SysPrintTemplate::getDeleted, 0).eq(SysPrintTemplate::getVersion, previous.getVersion())) != 1) {
            throw new ServiceException("模板已被修改，请刷新后重试", 409);
        }
        if (uploaded != null && fileMapper.update(null, new LambdaUpdateWrapper<SysFile>()
                .eq(SysFile::getFileId, uploaded.getFileId()).eq(SysFile::getTenantId, tenant)
                .eq(SysFile::getDeleted, 0).isNull(SysFile::getBizType)
                .set(SysFile::getBizType, "PRINT_TEMPLATE").set(SysFile::getBizId, next.getTemplateId().toString())
                .set(SysFile::getAccessType, "PRIVATE")) != 1) {
            throw new ServiceException("模板附件绑定失败", 409);
        }
        if (next.getDefaultFlag() == 1) mapper.clearOtherDefaults(tenant, next.getBizType(), next.getTemplateId(), operator());
        if (previous != null && previous.getTemplateFileUrl() != null
                && !Objects.equals(previous.getTemplateFileUrl(), next.getTemplateFileUrl())) {
            fileService.removePrintTemplateFile(previous.getTemplateId(), fileId(previous.getTemplateFileUrl()));
        }
        return next;
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除打印模板", highRisk = true)
    public void remove(Long id, Integer version) {
        Long tenant = tenantId();
        lockTenant(tenant);
        SysPrintTemplate previous = require(id, tenant);
        if (version == null || !version.equals(previous.getVersion())) throw new ServiceException("模板已被修改，请刷新后重试", 409);
        if (mapper.update(null, new LambdaUpdateWrapper<SysPrintTemplate>()
                .eq(SysPrintTemplate::getTemplateId, id).eq(SysPrintTemplate::getTenantId, tenant)
                .eq(SysPrintTemplate::getDeleted, 0).eq(SysPrintTemplate::getVersion, version)
                .set(SysPrintTemplate::getDeleted, 1).set(SysPrintTemplate::getDefaultFlag, 0)
                .set(SysPrintTemplate::getVersion, Math.addExact(version, 1))
                .set(SysPrintTemplate::getUpdateBy, operator()).set(SysPrintTemplate::getUpdateTime, LocalDateTime.now())) != 1) {
            throw new ServiceException("模板已被修改，请刷新后重试", 409);
        }
        if (previous.getTemplateFileUrl() != null) {
            fileService.removePrintTemplateFile(previous.getTemplateId(), fileId(previous.getTemplateFileUrl()));
        }
    }

    public void download(Long id, HttpServletResponse response) {
        Long tenant = tenantId();
        SysPrintTemplate template = require(id, tenant);
        SysFile file = requireFile(fileId(template.getTemplateFileUrl()), template, tenant);
        response.setContentType("application/octet-stream");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Disposition", ContentDisposition.attachment().filename(file.getFileName(), StandardCharsets.UTF_8).build().toString());
        try (InputStream input = storageRegistry.getForFile(file).open(file.getFilePath())) {
            input.transferTo(response.getOutputStream());
        } catch (IOException exception) { throw new ServiceException("模板文件读取失败", 503); }
    }

    private SysPrintTemplate normalize(PrintTemplateDTO dto) {
        SysPrintTemplate next = new SysPrintTemplate();
        BeanUtils.copyProperties(dto, next);
        next.setTemplateCode(required(dto.getTemplateCode(), 50, "模板编码"));
        next.setTemplateName(required(dto.getTemplateName(), 100, "模板名称"));
        next.setBizType(upper(required(dto.getBizType(), 50, "业务类型")));
        if (!next.getBizType().matches("[A-Z][A-Z0-9_]*")) throw new ServiceException("业务类型须为字母、数字和下划线", 400);
        next.setTemplateFormat(choice(dto.getTemplateFormat(), null, List.of("HTML", "EXCEL"), "模板格式"));
        next.setOutputFormat(choice(dto.getOutputFormat(), null, List.of("HTML", "PDF", "EXCEL"), "输出格式"));
        if ("HTML".equals(next.getTemplateFormat())) {
            if ("EXCEL".equals(next.getOutputFormat())) throw new ServiceException("HTML 模板支持 HTML 或 PDF 输出", 400);
            required(dto.getTemplateContent(), 1048576, "HTML 内容");
            next.setTemplateFileUrl(null);
        } else {
            if ("HTML".equals(next.getOutputFormat())) throw new ServiceException("Excel 模板支持 Excel 或 PDF 输出", 400);
            next.setTemplateContent(null);
            next.setTemplateFileUrl(trim(dto.getTemplateFileUrl()));
        }
        next.setPaperSize(choice(dto.getPaperSize(), "A4", List.of("A4", "A5", "LETTER", "CUSTOM"), "纸张规格"));
        next.setOrientation(choice(dto.getOrientation(), "PORTRAIT", List.of("PORTRAIT", "LANDSCAPE"), "纸张方向"));
        BigDecimal width = new BigDecimal("210");
        BigDecimal height = new BigDecimal("297");
        switch (next.getPaperSize()) {
            case "A5" -> { width = new BigDecimal("148"); height = new BigDecimal("210"); }
            case "LETTER" -> { width = new BigDecimal("215.9"); height = new BigDecimal("279.4"); }
            case "CUSTOM" -> {
                width = decimal(dto.getPaperWidthMm(), null, "纸张宽度");
                height = decimal(dto.getPaperHeightMm(), null, "纸张高度");
                if (width.signum() <= 0 || height.signum() <= 0) throw new ServiceException("自定义纸张宽高必须大于0", 400);
            }
            default -> { }
        }
        next.setPaperWidthMm("CUSTOM".equals(next.getPaperSize()) ? width : null);
        next.setPaperHeightMm("CUSTOM".equals(next.getPaperSize()) ? height : null);
        if ("LANDSCAPE".equals(next.getOrientation())) { BigDecimal swap = width; width = height; height = swap; }
        next.setMarginTop(decimal(dto.getMarginTop(), BigDecimal.TEN, "上边距"));
        next.setMarginBottom(decimal(dto.getMarginBottom(), BigDecimal.TEN, "下边距"));
        next.setMarginLeft(decimal(dto.getMarginLeft(), BigDecimal.TEN, "左边距"));
        next.setMarginRight(decimal(dto.getMarginRight(), BigDecimal.TEN, "右边距"));
        if (next.getMarginTop().add(next.getMarginBottom()).compareTo(height) >= 0
                || next.getMarginLeft().add(next.getMarginRight()).compareTo(width) >= 0) throw new ServiceException("页边距须为纸张保留有效打印区域", 400);
        next.setDefaultFlag(dto.getDefaultFlag() == null ? 0 : dto.getDefaultFlag());
        if (next.getDefaultFlag() != 0 && next.getDefaultFlag() != 1) throw new ServiceException("默认标记只能为0或1", 400);
        next.setStatus(choice(dto.getStatus(), "ENABLED", List.of("ENABLED", "DISABLED"), "模板状态"));
        if (next.getDefaultFlag() == 1 && !"ENABLED".equals(next.getStatus())) throw new ServiceException("默认模板必须启用，请先取消默认或选择其他默认模板", 400);
        limit(dto.getRemark(), 500, "备注");
        limit(dto.getVariablesDeclare(), 65536, "变量声明");
        next.setVariablesDeclare(trim(dto.getVariablesDeclare()));
        if (next.getVariablesDeclare() != null) {
            try {
                JsonNode root = json.readTree(next.getVariablesDeclare());
                if (root == null || !(root.isArray() || root.isObject())) throw new ServiceException("变量声明须为 JSON 对象或数组", 400);
            } catch (IOException failure) { throw new ServiceException("变量声明 JSON 格式不正确", 400); }
        }
        return next;
    }

    private SysPrintTemplate require(Long id, Long tenant) {
        if (id == null || id <= 0) throw new ServiceException("模板ID无效", 400);
        SysPrintTemplate template = mapper.selectOne(scope(tenant).eq(SysPrintTemplate::getTemplateId, id));
        if (template == null) throw new ServiceException("模板不存在或无权访问", 404);
        return template;
    }

    private SysFile requireFile(Long id, SysPrintTemplate template, Long tenant) {
        SysFile file = fileMapper.selectOne(new LambdaQueryWrapper<SysFile>()
                .eq(SysFile::getFileId, id).eq(SysFile::getTenantId, tenant).eq(SysFile::getDeleted, 0)
                .eq(SysFile::getBizType, "PRINT_TEMPLATE").eq(SysFile::getBizId, template.getTemplateId().toString())
                .eq(SysFile::getAccessType, "PRIVATE"));
        if (file == null) throw new ServiceException("模板附件不存在或无权访问", 403);
        return file;
    }

    private LambdaQueryWrapper<SysPrintTemplate> scope(Long tenant) {
        return new LambdaQueryWrapper<SysPrintTemplate>().eq(SysPrintTemplate::getTenantId, tenant).eq(SysPrintTemplate::getDeleted, 0);
    }
    private void lockTenant(Long tenant) { if (mapper.lockTenant(tenant) == null) throw new ServiceException("租户不存在", 403); }
    private Long tenantId() {
        if (UserContext.getUserId() == null || UserContext.getTenantId() == null) throw new ServiceException("缺少当前用户或租户", 403);
        return UserContext.getTenantId();
    }
    private String operator() { return trim(UserContext.getUserName()) == null ? UserContext.getUserId().toString() : UserContext.getUserName(); }
    private String reference(Long id) { return "sys_file:" + id; }
    private Long fileId(String reference) {
        if (reference == null || !reference.matches("sys_file:[1-9][0-9]{0,18}")) throw new ServiceException("模板附件引用无效", 400);
        try { return Long.valueOf(reference.substring(9)); }
        catch (NumberFormatException failure) { throw new ServiceException("模板附件引用无效", 400); }
    }
    private String required(String value, int max, String label) {
        if (trim(value) == null) throw new ServiceException(label + "不能为空", 400);
        limit(value, max, label);
        return value.trim();
    }
    private void limit(String value, int max, String label) { if (value != null && value.length() > max) throw new ServiceException(label + "长度超出限制", 400); }
    private String choice(String value, String fallback, List<String> allowed, String label) {
        String normalized = trim(value) == null ? fallback : upper(value);
        if (normalized == null || !allowed.contains(normalized)) throw new ServiceException(label + "无效", 400);
        return normalized;
    }
    private BigDecimal decimal(BigDecimal value, BigDecimal fallback, String label) {
        BigDecimal result = value == null ? fallback : value;
        if (result == null || result.signum() < 0 || result.compareTo(new BigDecimal("9999.99")) > 0
                || result.stripTrailingZeros().scale() > 2) throw new ServiceException(label + "须为0至9999.99的数值，最多2位小数", 400);
        return result;
    }
    private String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String upper(String value) { String normalized = trim(value); return normalized == null ? null : normalized.toUpperCase(Locale.ROOT); }
}
