package com.cloudflow.oa.importing;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.excel.importing.ImportColumn;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportDefinition;
import com.cloudflow.common.excel.importing.ImportError;
import com.cloudflow.common.excel.importing.ImportHandler;
import com.cloudflow.common.excel.importing.ImportKeys;
import com.cloudflow.common.excel.importing.ImportReference;
import com.cloudflow.oa.domain.OaSupplierCategory;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.mapper.OaImportMapper;
import com.cloudflow.oa.mapper.OaSupplierCategoryMapper;
import com.cloudflow.oa.service.ISupplierService;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SupplierImport implements ImportDefinition<SysSupplier>, ImportHandler<SysSupplier> {
    private final OaImportMapper imports;
    private final OaSupplierCategoryMapper categories;
    private final ISupplierService service;

    @Override public String bizType() { return "SUPPLIER"; }
    @Override public String bizName() { return "供应商"; }
    @Override public String permission() { return "oa:supplier:import"; }
    @Override public Class<SysSupplier> rowClass() { return SysSupplier.class; }
    @Override public List<List<String>> uniqueKeys() { return List.of(List.of("supplierCode"), List.of("creditCode")); }

    @Override
    public List<ImportColumn> columns() {
        return List.of(
                ImportColumn.builder().field("supplierCode").name("供应商编号").required(true).maxLength(50).example("SUP2026001").build(),
                ImportColumn.builder().field("supplierName").name("供应商名称").required(true).maxLength(100).example("示例供应商").build(),
                ImportColumn.builder().field("categoryId").name("供应商分类").type(ImportColumn.Type.REFERENCE).reference("SUPPLIER_CATEGORY").maxLength(100).example("办公用品").build(),
                ImportColumn.builder().field("supplierType").name("供应商类型").maxLength(20).options(Map.of("MANUFACTURER", "制造商", "DEALER", "经销商", "SERVICE", "服务商", "INDIVIDUAL", "个人")).example("服务商").build(),
                ImportColumn.builder().field("creditCode").name("统一社会信用代码").maxLength(18).pattern("[A-Za-z0-9]{18}").example("以企业实际登记信息为准").build(),
                ImportColumn.builder().field("contactName").name("联系人").maxLength(64).example("李四").build(),
                ImportColumn.builder().field("contactPhone").name("联系电话").maxLength(30).example("010-12345678").build(),
                ImportColumn.builder().field("contactEmail").name("联系邮箱").type(ImportColumn.Type.EMAIL).maxLength(100).example("supplier@example.com").build(),
                ImportColumn.builder().field("registerCapital").name("注册资本").type(ImportColumn.Type.DECIMAL).minimum(BigDecimal.ZERO).maximum(new BigDecimal("999999999999.99")).pattern("[-+]?\\d+(?:\\.\\d{1,2})?").example("1000000.00").build(),
                ImportColumn.builder().field("registerDate").name("成立日期").type(ImportColumn.Type.DATE).maxLength(10).example("2020-01-01").build(),
                ImportColumn.builder().field("taxRate").name("税率").type(ImportColumn.Type.DECIMAL).minimum(BigDecimal.ZERO).maximum(BigDecimal.ONE).pattern("[-+]?\\d+(?:\\.\\d{1,4})?").example("0.13").build(),
                ImportColumn.builder().field("currency").name("币种").maxLength(10).example("CNY").build(),
                ImportColumn.builder().field("address").name("地址").maxLength(500).example("企业注册地址").build(),
                ImportColumn.builder().field("status").name("状态").maxLength(20).options(Map.of("ACTIVE", "启用", "DISABLED", "停用")).example("启用").build());
    }

    @Override
    public void prepare(ImportContext context) {
        context.addReferences("SUPPLIER_CATEGORY", categories.selectList(new LambdaQueryWrapper<OaSupplierCategory>()
                .eq(OaSupplierCategory::getTenantId, context.getTenantId()).eq(OaSupplierCategory::getDeleted, 0).eq(OaSupplierCategory::getStatus, "ACTIVE"))
                .stream().map(category -> new ImportReference(category.getCategoryCode(), category.getCategoryName(), category.getCategoryId())).toList());
    }

    @Override
    public Set<String> findExistingKeys(List<SysSupplier> rows, ImportContext context) {
        Set<String> result = new HashSet<>();
        imports.existingSuppliers(context.getTenantId(), rows.stream().map(SysSupplier::getSupplierCode).toList(),
                rows.stream().map(SysSupplier::getCreditCode).filter(Objects::nonNull).toList()).forEach(supplier -> {
                    if (supplier.getSupplierCode() != null) result.add(ImportKeys.forFields(uniqueKeys().get(0), supplier.getSupplierCode()));
                    if (supplier.getCreditCode() != null) result.add(ImportKeys.forFields(uniqueKeys().get(1), supplier.getCreditCode()));
                });
        return result;
    }

    @Override
    public List<ImportError> validateRow(SysSupplier row, int rowNo, ImportContext context) { return List.of(); }

    @Override
    public void importRow(SysSupplier row, int rowNo, ImportContext context) {
        if (!service.createSupplier(row)) throw new ServiceException("供应商保存失败");
    }
}
