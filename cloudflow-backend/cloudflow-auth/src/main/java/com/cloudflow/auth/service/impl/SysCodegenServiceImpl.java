package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysCodegenColumn;
import com.cloudflow.auth.domain.SysCodegenTable;
import com.cloudflow.auth.domain.dto.CodegenImportDTO;
import com.cloudflow.auth.domain.dto.CodegenSaveDTO;
import com.cloudflow.auth.domain.dto.CodegenWriteDTO;
import com.cloudflow.auth.domain.vo.CodegenDetailVO;
import com.cloudflow.auth.domain.vo.CodegenOptionsVO;
import com.cloudflow.auth.domain.vo.CodegenWriteResultVO;
import com.cloudflow.auth.domain.vo.DbColumnMetadataVO;
import com.cloudflow.auth.domain.vo.DbTableVO;
import com.cloudflow.auth.mapper.SysCodegenColumnMapper;
import com.cloudflow.auth.mapper.SysCodegenTableMapper;
import com.cloudflow.auth.service.ISysCodegenService;
import com.cloudflow.auth.service.codegen.CodegenTemplateRenderer;
import com.cloudflow.auth.service.codegen.CodegenDirectoryGuard;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.LinkOption;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 代码生成器服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysCodegenServiceImpl extends ServiceImpl<SysCodegenTableMapper, SysCodegenTable>
        implements ISysCodegenService {

    private static final Set<String> ALLOWED_MODULES = Set.of("system", "oa", "crm", "hr", "workflow");
    private static final Set<String> ALLOWED_TEMPLATES = Set.of("CRUD", "TREE", "SUB", "INNER", "HR_TYPED");
    private static final Set<String> AUDIT_COLUMNS = Set.of(
            "deleted", "version", "create_by", "create_time", "update_by", "update_time");
    private static final Set<String> SENSITIVE_ROOTS = Set.of("DB", "config", ".git", "target");

    private final SysCodegenColumnMapper columnMapper;
    private final CodegenTemplateRenderer templateRenderer;

    @Value("${cloudflow.codegen.project-root:}")
    private String configuredProjectRoot;

    @Override
    public PageResult<DbTableVO> selectDatabaseTablePage(String tableName, String tableComment,
                                                         int pageNum, int pageSize) {
        Long tenantId = currentTenantId();
        List<DbTableVO> all = baseMapper.selectDatabaseTables(
                blankToNull(tableName), blankToNull(tableComment), tenantId);
        return page(all, pageNum, pageSize);
    }

    @Override
    public PageResult<SysCodegenTable> selectImportedTablePage(SysCodegenTable query,
                                                               int pageNum, int pageSize) {
        LambdaQueryWrapper<SysCodegenTable> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysCodegenTable::getTenantId, currentTenantId())
                .eq(SysCodegenTable::getDeleted, 0)
                .like(query != null && StringUtils.hasText(query.getTableName()),
                        SysCodegenTable::getTableName, query == null ? null : query.getTableName())
                .like(query != null && StringUtils.hasText(query.getFunctionName()),
                        SysCodegenTable::getFunctionName, query == null ? null : query.getFunctionName())
                .eq(query != null && StringUtils.hasText(query.getModuleName()),
                        SysCodegenTable::getModuleName, query == null ? null : query.getModuleName())
                .orderByDesc(SysCodegenTable::getTableId);
        Page<SysCodegenTable> page = page(new Page<>(pageNum, pageSize), wrapper);
        return new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    @Override
    public CodegenDetailVO getDetail(Long tableId) {
        SysCodegenTable table = getOwnedTable(tableId);
        List<SysCodegenColumn> columns = columnMapper.selectList(
                new LambdaQueryWrapper<SysCodegenColumn>()
                        .eq(SysCodegenColumn::getTableId, tableId)
                        .orderByAsc(SysCodegenColumn::getSortNo));
        return new CodegenDetailVO(table, columns);
    }

    @Override
    public CodegenOptionsVO getOptions() {
        return CodegenOptionsVO.builder()
                .modules(List.of("system", "oa", "crm", "hr", "workflow"))
                .templateCategories(List.of("CRUD", "TREE", "SUB", "INNER", "HR_TYPED"))
                .queryTypes(List.of("EQ", "NE", "GT", "GE", "LT", "LE", "LIKE", "BETWEEN", "IN"))
                .htmlTypes(List.of("input", "textarea", "number", "select", "radio", "checkbox",
                        "date", "datetime", "daterange", "upload", "editor"))
                .javaTypes(List.of("String", "Long", "Integer", "BigDecimal", "LocalDateTime", "LocalDate", "LocalTime"))
                .build();
    }

    @Override
    @Audit(name = "导入代码生成表结构")
    @Transactional(rollbackFor = Exception.class)
    public void importTables(CodegenImportDTO dto) {
        if (dto == null) throw new ServiceException("导入请求不能为空");
        String moduleName = normalizeModule(dto.getModuleName());
        if (dto.getTableNames() == null || dto.getTableNames().isEmpty()) {
            throw new ServiceException("请选择需要导入的表");
        }
        Set<String> uniqueNames = dto.getTableNames().stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
        if (uniqueNames.isEmpty()) {
            throw new ServiceException("请选择需要导入的表");
        }
        for (String tableName : uniqueNames) {
            importOne(tableName, moduleName);
        }
    }

    @Override
    @Audit(name = "保存代码生成配置")
    @Transactional(rollbackFor = Exception.class)
    public void saveConfiguration(CodegenSaveDTO dto) {
        if (dto == null || dto.getTable() == null) {
            throw new ServiceException("表配置不能为空");
        }
        SysCodegenTable incoming = dto.getTable();
        validateTableConfig(incoming);
        if (dto.getColumns() == null || dto.getColumns().isEmpty()) {
            throw new ServiceException("字段配置不能为空");
        }
        Set<String> columnNames = new HashSet<>();
        for (SysCodegenColumn column : dto.getColumns()) {
            validateColumnConfig(column);
            normalizeColumnFlags(column);
            if (!columnNames.add(column.getColumnName().toLowerCase(Locale.ROOT))) {
                throw new ServiceException("字段名不能重复：" + column.getColumnName());
            }
        }
        validateTemplateRelations(incoming, dto.getColumns(), columnNames);
        SysCodegenTable existing = getOwnedTable(incoming.getTableId());
        BeanUtils.copyProperties(incoming, existing, "tenantId", "deleted", "version", "createBy", "createTime");
        existing.setTenantId(currentTenantId());
        existing.setUpdateBy(currentUserName());
        existing.setUpdateTime(LocalDateTime.now());
        updateById(existing);

        columnMapper.delete(new LambdaQueryWrapper<SysCodegenColumn>()
                .eq(SysCodegenColumn::getTableId, existing.getTableId()));
        int sort = 0;
        for (SysCodegenColumn incomingColumn : dto.getColumns() == null
                ? List.<SysCodegenColumn>of() : dto.getColumns()) {
            incomingColumn.setColumnId(null);
            incomingColumn.setTableId(existing.getTableId());
            incomingColumn.setSortNo(incomingColumn.getSortNo() == null ? sort : incomingColumn.getSortNo());
            normalizeColumnFlags(incomingColumn);
            columnMapper.insert(incomingColumn);
            sort++;
        }
    }

    @Override
    @Audit(name = "同步代码生成表结构")
    @Transactional(rollbackFor = Exception.class)
    public void syncTable(Long tableId) {
        SysCodegenTable table = getOwnedTable(tableId);
        DbTableVO metadata = baseMapper.selectDatabaseTable(table.getTableName());
        if (metadata == null) {
            throw new ServiceException("数据库表不存在：" + table.getTableName());
        }
        List<SysCodegenColumn> oldColumns = columnMapper.selectList(
                new LambdaQueryWrapper<SysCodegenColumn>().eq(SysCodegenColumn::getTableId, tableId));
        Map<String, SysCodegenColumn> oldByName = oldColumns.stream()
                .collect(Collectors.toMap(SysCodegenColumn::getColumnName, Function.identity(), (a, b) -> a));
        List<SysCodegenColumn> synced = buildColumns(table.getTableName(), tableId,
                baseMapper.selectDatabaseColumns(table.getTableName()), oldByName);
        columnMapper.delete(new LambdaQueryWrapper<SysCodegenColumn>().eq(SysCodegenColumn::getTableId, tableId));
        synced.forEach(columnMapper::insert);
        table.setTableComment(metadata.getTableComment());
        table.setUpdateBy(currentUserName());
        table.setUpdateTime(LocalDateTime.now());
        updateById(table);
    }

    @Override
    @Audit(name = "预览生成代码")
    public Map<String, String> preview(Long tableId) {
        CodegenDetailVO detail = getDetail(tableId);
        return templateRenderer.render(detail.getTable(), detail.getColumns());
    }

    @Override
    @Audit(name = "下载生成代码")
    public void download(Long tableId, HttpServletResponse response) {
        Map<String, String> files = preview(tableId);
        String fileName = getOwnedTable(tableId).getTableName() + "-generated.zip";
        response.setContentType("application/zip");
        response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''"
                + URLEncoder.encode(fileName, StandardCharsets.UTF_8));
        try (ZipOutputStream zip = new ZipOutputStream(response.getOutputStream(), StandardCharsets.UTF_8)) {
            for (Map.Entry<String, String> entry : files.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        } catch (IOException e) {
            throw new ServiceException("下载生成代码失败", e);
        }
    }

    @Override
    @Audit(name = "写入生成代码", highRisk = true)
    public CodegenWriteResultVO writeToDisk(Long tableId, CodegenWriteDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getTargetRoot())) {
            throw new ServiceException("写入目录不能为空");
        }
        Path root = resolveProjectRoot();
        Path targetRoot = resolveSafeTarget(root, dto.getTargetRoot());
        Map<String, String> files = preview(tableId);
        List<String> written = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        List<String> overwritten = new ArrayList<>();
        boolean confirmOverwrite = Boolean.TRUE.equals(dto.getConfirmOverwrite());
        try (CodegenDirectoryGuard guard = new CodegenDirectoryGuard(root)) {
            Path canonicalTargetRoot = canonicalSafeTarget(root, targetRoot);
            guard.createDirectories(root, canonicalTargetRoot);
            for (Map.Entry<String, String> entry : files.entrySet()) {
                Path requestedTarget = resolveSafeTarget(targetRoot, entry.getKey());
                Path target = canonicalSafeTarget(root, requestedTarget.getParent()).resolve(requestedTarget.getFileName());
                guard.createDirectories(root, target.getParent());
                boolean exists = Files.exists(guard.filePath(target), LinkOption.NOFOLLOW_LINKS);
                if (exists && !confirmOverwrite) {
                    skipped.add(root.relativize(requestedTarget).toString().replace('\\', '/'));
                    continue;
                }
                guard.writeFile(target, entry.getValue(), exists);
                String relative = root.relativize(requestedTarget).toString().replace('\\', '/');
                if (exists) {
                    overwritten.add(relative);
                } else {
                    written.add(relative);
                }
            }
        } catch (IOException e) {
            throw new ServiceException("写入生成代码失败", e);
        }
        return CodegenWriteResultVO.builder()
                .written(written).skipped(skipped).overwritten(overwritten).build();
    }

    @Override
    @Audit(name = "删除代码生成配置", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void remove(List<Long> tableIds) {
        if (tableIds == null || tableIds.isEmpty()) {
            return;
        }
        for (Long tableId : tableIds) {
            SysCodegenTable table = getOwnedTable(tableId);
            table.setUpdateBy(currentUserName());
            table.setUpdateTime(LocalDateTime.now());
            if (baseMapper.markDeleted(table) != 1) {
                throw new ServiceException("生成配置已变化，请刷新后重试");
            }
            columnMapper.delete(new LambdaQueryWrapper<SysCodegenColumn>()
                    .eq(SysCodegenColumn::getTableId, tableId));
        }
    }

    private void importOne(String tableName, String moduleName) {
        validateIdentifier(tableName, "表名");
        DbTableVO metadata = baseMapper.selectDatabaseTable(tableName);
        if (metadata == null) {
            throw new ServiceException("数据库表不存在：" + tableName);
        }
        Long tenantId = currentTenantId();
        SysCodegenTable existing = baseMapper.selectIncludingDeleted(tenantId, tableName);
        if (existing != null && Integer.valueOf(0).equals(existing.getDeleted())) {
            throw new ServiceException("表已导入：" + tableName);
        }
        SysCodegenTable table = existing == null ? new SysCodegenTable() : existing;
        table.setTenantId(tenantId);
        table.setTableName(tableName);
        table.setTableComment(metadata.getTableComment());
        table.setModuleName(moduleName);
        table.setBusinessName(inferBusinessName(tableName));
        table.setClassName(inferClassName(tableName, moduleName));
        table.setFunctionName(StringUtils.hasText(metadata.getTableComment())
                ? metadata.getTableComment() : tableName);
        table.setPackageName(inferPackageName(moduleName));
        table.setAuthor("CloudFlow");
        table.setTplCategory("CRUD");
        table.setParentMenuId(6L);
        table.setTenantFieldFlag(hasColumn(tableName, "tenant_id") ? 1 : 0);
        table.setLogicDeleteFlag(hasColumn(tableName, "deleted") ? 1 : 0);
        table.setVersionFieldFlag(hasColumn(tableName, "version") ? 1 : 0);
        table.setDeleted(0);
        table.setUpdateBy(currentUserName());
        table.setUpdateTime(LocalDateTime.now());
        if (table.getTableId() == null) {
            table.setCreateBy(currentUserName());
            table.setCreateTime(LocalDateTime.now());
            save(table);
        } else {
            if (baseMapper.restoreDeleted(table) != 1) {
                throw new ServiceException("生成配置已变化，请刷新后重试");
            }
            table.setVersion(table.getVersion() + 1);
            if (!updateById(table)) {
                throw new ServiceException("生成配置已变化，请刷新后重试");
            }
            columnMapper.delete(new LambdaQueryWrapper<SysCodegenColumn>()
                    .eq(SysCodegenColumn::getTableId, table.getTableId()));
        }
        List<SysCodegenColumn> columns = buildColumns(tableName, table.getTableId(),
                baseMapper.selectDatabaseColumns(tableName), Map.of());
        columns.forEach(columnMapper::insert);
    }

    private List<SysCodegenColumn> buildColumns(String tableName, Long tableId,
                                                List<DbColumnMetadataVO> metadata,
                                                Map<String, SysCodegenColumn> oldByName) {
        List<SysCodegenColumn> result = new ArrayList<>();
        int sort = 0;
        for (DbColumnMetadataVO source : metadata) {
            SysCodegenColumn old = oldByName.get(source.getColumnName());
            SysCodegenColumn column = old == null ? new SysCodegenColumn() : old;
            column.setTableId(tableId);
            column.setColumnName(source.getColumnName());
            column.setColumnComment(old == null ? source.getColumnComment() : old.getColumnComment());
            column.setColumnType(source.getColumnType());
            column.setJavaType(old != null && StringUtils.hasText(old.getJavaType())
                    ? old.getJavaType() : mapJavaType(source.getDataType()));
            column.setJavaField(old != null && StringUtils.hasText(old.getJavaField())
                    ? old.getJavaField() : toJavaField(source.getColumnName()));
            column.setPkFlag("PRI".equalsIgnoreCase(source.getColumnKey()) ? 1 : 0);
            column.setIncrementFlag(source.getExtra() != null
                    && source.getExtra().toLowerCase(Locale.ROOT).contains("auto_increment") ? 1 : 0);
            boolean audit = AUDIT_COLUMNS.contains(source.getColumnName());
            column.setAuditFieldFlag(audit ? 1 : 0);
            if (old == null) {
                column.setRequiredFlag("NO".equalsIgnoreCase(source.getIsNullable())
                        && source.getColumnDefault() == null && !audit ? 1 : 0);
                column.setInsertFlag(audit || column.getPkFlag() == 1 ? 0 : 1);
                column.setEditFlag(audit || column.getPkFlag() == 1 ? 0 : 1);
                column.setListFlag(audit ? 0 : 1);
                column.setQueryFlag(0);
                column.setQueryType("EQ");
                column.setHtmlType(inferHtmlType(column.getJavaType()));
                column.setSortNo(sort);
            } else {
                column.setSortNo(old.getSortNo() == null ? sort : old.getSortNo());
            }
            normalizeColumnFlags(column);
            result.add(column);
            sort++;
        }
        return result;
    }

    private void normalizeColumnFlags(SysCodegenColumn column) {
        if (column.getPkFlag() == null) column.setPkFlag(0);
        if (column.getIncrementFlag() == null) column.setIncrementFlag(0);
        if (column.getRequiredFlag() == null) column.setRequiredFlag(0);
        if (column.getInsertFlag() == null) column.setInsertFlag(1);
        if (column.getEditFlag() == null) column.setEditFlag(1);
        if (column.getListFlag() == null) column.setListFlag(1);
        if (column.getQueryFlag() == null) column.setQueryFlag(0);
        if (!StringUtils.hasText(column.getQueryType())) column.setQueryType("EQ");
        if (!StringUtils.hasText(column.getHtmlType())) column.setHtmlType("input");
        if (column.getAuditFieldFlag() == null) column.setAuditFieldFlag(0);
        String columnName = column.getColumnName() == null
                ? "" : column.getColumnName().toLowerCase(Locale.ROOT);
        boolean auditColumn = AUDIT_COLUMNS.contains(columnName);
        boolean managedColumn = auditColumn || "tenant_id".equals(columnName);
        if (auditColumn) {
            column.setAuditFieldFlag(1);
        }
        if (managedColumn) {
            column.setInsertFlag(0);
            column.setEditFlag(0);
            column.setListFlag(0);
            column.setQueryFlag(0);
        }
    }

    private void validateColumnConfig(SysCodegenColumn column) {
        if (column == null) throw new ServiceException("字段配置不能为空");
        validateIdentifier(column.getColumnName(), "列名");
        validateIdentifier(column.getJavaField(), "Java字段名");
        if (!StringUtils.hasText(column.getJavaType())
                || !column.getJavaType().matches("[A-Za-z_$][A-Za-z0-9_$.]*")) {
            throw new ServiceException("Java类型格式不合法");
        }
        if (!StringUtils.hasText(column.getColumnType())
                || !column.getColumnType().matches("[A-Za-z0-9_(),. ]+")) {
            throw new ServiceException("数据库类型格式不合法");
        }
        if (StringUtils.hasText(column.getQueryType())) {
            String queryType = column.getQueryType().trim().toUpperCase(Locale.ROOT);
            if (!Set.of("EQ", "NE", "GT", "GE", "LT", "LE", "LIKE", "BETWEEN", "IN").contains(queryType)) {
                throw new ServiceException("查询方式不受支持：" + column.getQueryType());
            }
            column.setQueryType(queryType);
        }
        validateBinaryFlag(column.getPkFlag(), "是否主键");
        validateBinaryFlag(column.getIncrementFlag(), "是否自增");
        validateBinaryFlag(column.getRequiredFlag(), "是否必填");
        validateBinaryFlag(column.getInsertFlag(), "是否参与新增");
        validateBinaryFlag(column.getEditFlag(), "是否参与编辑");
        validateBinaryFlag(column.getListFlag(), "是否参与列表");
        validateBinaryFlag(column.getQueryFlag(), "是否参与查询");
        validateBinaryFlag(column.getAuditFieldFlag(), "是否审计列");
    }

    private boolean hasColumn(String tableName, String columnName) {
        return baseMapper.selectDatabaseColumns(tableName).stream()
                .anyMatch(column -> columnName.equalsIgnoreCase(column.getColumnName()));
    }

    private SysCodegenTable getOwnedTable(Long tableId) {
        if (tableId == null) {
            throw new ServiceException("表ID不能为空");
        }
        SysCodegenTable table = getOne(new LambdaQueryWrapper<SysCodegenTable>()
                .eq(SysCodegenTable::getTableId, tableId)
                .eq(SysCodegenTable::getTenantId, currentTenantId())
                .eq(SysCodegenTable::getDeleted, 0));
        if (table == null) {
            throw new ServiceException("代码生成表不存在", 404);
        }
        return table;
    }

    private void validateTableConfig(SysCodegenTable table) {
        table.setModuleName(normalizeModule(table.getModuleName()));
        if (!StringUtils.hasText(table.getTableName()) || !StringUtils.hasText(table.getBusinessName())
                || !StringUtils.hasText(table.getClassName()) || !StringUtils.hasText(table.getPackageName())
                || !StringUtils.hasText(table.getFunctionName())) {
            throw new ServiceException("表名、业务名、类名、功能名称和包路径不能为空");
        }
        validateIdentifier(table.getTableName(), "表名");
        validateIdentifier(table.getBusinessName(), "业务名");
        validateJavaTypeName(table.getClassName(), "类名");
        if (!StringUtils.hasText(table.getPackageName())
                || !table.getPackageName().matches("[A-Za-z_$][A-Za-z0-9_$]*(\\.[A-Za-z_$][A-Za-z0-9_$]*)*")) {
            throw new ServiceException("包路径格式不合法");
        }
        String templateCategory = table.getTplCategory() == null ? "" : table.getTplCategory().trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_TEMPLATES.contains(templateCategory)) {
            throw new ServiceException("模板类型不受支持：" + table.getTplCategory());
        }
        table.setTplCategory(templateCategory);
        validateBinaryFlag(table.getTenantFieldFlag(), "是否包含租户字段");
        validateBinaryFlag(table.getLogicDeleteFlag(), "是否包含逻辑删除字段");
        validateBinaryFlag(table.getVersionFieldFlag(), "是否包含乐观锁字段");
        if (table.getTenantFieldFlag() == null) table.setTenantFieldFlag(1);
        if (table.getLogicDeleteFlag() == null) table.setLogicDeleteFlag(1);
        if (table.getVersionFieldFlag() == null) table.setVersionFieldFlag(1);
    }

    private void validateTemplateRelations(SysCodegenTable table, List<SysCodegenColumn> columns,
                                           Set<String> columnNames) {
        long primaryKeyCount = columns.stream()
                .filter(column -> Integer.valueOf(1).equals(column.getPkFlag()))
                .count();
        if (primaryKeyCount != 1) {
            throw new ServiceException("代码生成表必须且只能配置一个主键");
        }
        if ("TREE".equals(table.getTplCategory())) {
            validateIdentifier(table.getTreeParentCode(), "树父字段");
            validateIdentifier(table.getTreeNameCode(), "树显示字段");
            if (!columnNames.contains(table.getTreeParentCode().toLowerCase(Locale.ROOT))
                    || !columnNames.contains(table.getTreeNameCode().toLowerCase(Locale.ROOT))) {
                throw new ServiceException("树父字段和显示字段必须来自当前表");
            }
            SysCodegenColumn primaryKey = columns.stream()
                    .filter(column -> Integer.valueOf(1).equals(column.getPkFlag()))
                    .findFirst().orElseThrow();
            SysCodegenColumn parentColumn = columns.stream()
                    .filter(column -> table.getTreeParentCode().equalsIgnoreCase(column.getColumnName()))
                    .findFirst().orElseThrow();
            if (!primaryKey.getJavaType().equals(parentColumn.getJavaType())) {
                throw new ServiceException("树父字段与主键的 Java 类型必须一致");
            }
        }
        if ("SUB".equals(table.getTplCategory())) {
            validateIdentifier(table.getSubTableName(), "子表名");
            validateIdentifier(table.getSubTableFk(), "子表外键");
            DbTableVO subTable = baseMapper.selectDatabaseTable(table.getSubTableName());
            if (subTable == null || !hasColumn(table.getSubTableName(), table.getSubTableFk())) {
                throw new ServiceException("子表或子表外键不存在");
            }
        }
        if ("HR_TYPED".equals(table.getTplCategory()) && !"hr".equals(table.getModuleName())) {
            throw new ServiceException("HR_TYPED 模板仅允许用于 hr 模块");
        }
        if (!Set.of("INNER", "HR_TYPED").contains(table.getTplCategory())
                && table.getParentMenuId() == null) {
            throw new ServiceException("外部 CRUD 模板必须配置上级菜单ID");
        }
    }

    private void validateBinaryFlag(Integer value, String label) {
        if (value != null && value != 0 && value != 1) {
            throw new ServiceException(label + "只能是 0 或 1");
        }
    }

    private void validateModule(String moduleName) {
        if (!ALLOWED_MODULES.contains(moduleName)) {
            throw new ServiceException("模块名必须是 system/oa/crm/hr/workflow 之一");
        }
    }

    private String normalizeModule(String moduleName) {
        String normalized = moduleName == null ? "" : moduleName.trim().toLowerCase(Locale.ROOT);
        validateModule(normalized);
        return normalized;
    }

    private void validateIdentifier(String value, String label) {
        if (!StringUtils.hasText(value) || !value.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            throw new ServiceException(label + "格式不合法");
        }
    }

    private void validateJavaTypeName(String value, String label) {
        if (!StringUtils.hasText(value) || !value.matches("[A-Za-z_$][A-Za-z0-9_$]*")) {
            throw new ServiceException(label + "格式不合法");
        }
    }

    private Path resolveProjectRoot() {
        Path root;
        if (StringUtils.hasText(configuredProjectRoot)) {
            root = Paths.get(configuredProjectRoot);
        } else {
            root = Paths.get(System.getProperty("user.dir"));
            Path cursor = root;
            while (cursor.getParent() != null
                    && !Files.exists(cursor.resolve(".git"))
                    && !Files.exists(cursor.resolve("AGENTS.md"))) {
                cursor = cursor.getParent();
            }
            root = cursor;
        }
        try {
            return root.toRealPath();
        } catch (IOException e) {
            throw new ServiceException("项目根目录不可用", e);
        }
    }

    private Path resolveSafeTarget(Path root, String rawPath) {
        boolean absolute;
        try {
            absolute = StringUtils.hasText(rawPath) && Paths.get(rawPath).isAbsolute();
        } catch (java.nio.file.InvalidPathException e) {
            throw new ServiceException("目标路径格式不合法");
        }
        if (!StringUtils.hasText(rawPath) || rawPath.contains("..")
                || rawPath.contains("\0") || absolute) {
            throw new ServiceException("目标路径不安全，禁止路径穿越或绝对路径");
        }
        Path normalized = root.resolve(rawPath).normalize();
        if (!normalized.startsWith(root)) {
            throw new ServiceException("目标路径必须位于项目根目录内");
        }
        rejectSensitiveTarget(root, normalized);
        try {
            // 解析最近的已存在祖先；即使目标目录尚未创建，也要拦截
            // root/link-to-outside/new 这类通过符号链接穿出的路径。
            Path existing = normalized;
            while (existing != null && !Files.exists(existing)) {
                existing = existing.getParent();
            }
            if (existing != null) {
                Path realRoot = root.toRealPath();
                Path realExisting = existing.toRealPath();
                if (!realExisting.startsWith(realRoot)) {
                    throw new ServiceException("目标路径不能通过符号链接离开项目根目录");
                }
                rejectSensitiveTarget(realRoot, realExisting);
            }
        } catch (IOException e) {
            throw new ServiceException("目标路径不可访问", e);
        }
        return normalized;
    }

    private Path canonicalSafeTarget(Path root, Path requested) throws IOException {
        Path existing = requested;
        while (existing != null && !Files.exists(existing, LinkOption.NOFOLLOW_LINKS)) {
            existing = existing.getParent();
        }
        if (existing == null) throw new IOException("写盘目录不存在");
        Path canonical = existing.toRealPath().resolve(existing.relativize(requested)).normalize();
        if (!canonical.startsWith(root)) throw new IOException("写盘目录在检查后越过项目边界");
        rejectSensitiveTarget(root, canonical);
        return canonical;
    }

    private void rejectSensitiveTarget(Path root, Path target) {
        Path relative = root.relativize(target);
        if (relative.getNameCount() > 0 && SENSITIVE_ROOTS.stream()
                .anyMatch(sensitive -> sensitive.equalsIgnoreCase(relative.getName(0).toString()))) {
            throw new ServiceException("禁止写入敏感目录：" + relative.getName(0));
        }
    }

    private String inferBusinessName(String tableName) {
        String value = tableName.replaceFirst("^(sys_|oa_|crm_|hr_|wf_|biz_)", "");
        return value.replaceAll("[^A-Za-z0-9_]+", "_");
    }

    private String inferClassName(String tableName, String moduleName) {
        String value = tableName.replaceFirst("^(sys_|oa_|crm_|hr_|wf_|biz_)", "");
        String pascal = Arrays.stream(value.split("_"))
                .filter(StringUtils::hasText)
                .map(part -> part.substring(0, 1).toUpperCase(Locale.ROOT) + part.substring(1))
                .collect(Collectors.joining());
        String prefix = switch (moduleName) {
            case "system" -> "Sys";
            case "hr" -> "Hr";
            case "crm" -> "Crm";
            case "workflow" -> "Wf";
            default -> "";
        };
        return prefix + pascal;
    }

    private String inferPackageName(String moduleName) {
        return switch (moduleName) {
            case "system" -> "com.cloudflow.auth";
            case "oa" -> "com.cloudflow.oa";
            case "crm" -> "com.cloudflow.crm";
            case "hr" -> "com.cloudflow.hr";
            case "workflow" -> "com.cloudflow.workflow";
            default -> throw new ServiceException("不支持的模块：" + moduleName);
        };
    }

    private String mapJavaType(String dataType) {
        if (dataType == null) return "String";
        return switch (dataType.toLowerCase(Locale.ROOT)) {
            case "bigint" -> "Long";
            case "int", "integer", "tinyint", "smallint", "mediumint" -> "Integer";
            case "decimal", "numeric", "double", "float" -> "BigDecimal";
            case "datetime", "timestamp" -> "LocalDateTime";
            case "date" -> "LocalDate";
            case "time" -> "LocalTime";
            default -> "String";
        };
    }

    private String inferHtmlType(String javaType) {
        return switch (javaType) {
            case "Integer", "Long", "BigDecimal" -> "number";
            case "LocalDate" -> "date";
            case "LocalDateTime" -> "datetime";
            case "LocalTime" -> "input";
            default -> "input";
        };
    }

    private String toJavaField(String columnName) {
        String[] parts = columnName.toLowerCase(Locale.ROOT).split("_");
        StringBuilder result = new StringBuilder(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            if (parts[i].isEmpty()) continue;
            result.append(parts[i].substring(0, 1).toUpperCase(Locale.ROOT)).append(parts[i].substring(1));
        }
        return result.toString();
    }

    private Long currentTenantId() {
        return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId();
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private <T> PageResult<T> page(List<T> rows, int pageNum, int pageSize) {
        int safePage = Math.max(1, pageNum);
        int safeSize = Math.max(1, Math.min(pageSize, 200));
        long requestedFrom = (long) (safePage - 1) * safeSize;
        int from = (int) Math.min(requestedFrom, rows.size());
        int to = Math.min(from + safeSize, rows.size());
        return new PageResult<>(rows.subList(from, to), rows.size(), safePage, safeSize);
    }
}
