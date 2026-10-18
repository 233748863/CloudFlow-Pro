package com.cloudflow.crm.importing;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.excel.importing.ImportColumn;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportDefinition;
import com.cloudflow.common.excel.importing.ImportError;
import com.cloudflow.common.excel.importing.ImportHandler;
import com.cloudflow.common.excel.importing.ImportKeys;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.mapper.CrmImportMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CustomerImport implements ImportDefinition<CrmCustomer>, ImportHandler<CrmCustomer> {
    private final CrmImportMapper imports;
    private final ICrmCustomerService service;

    @Override public String bizType() { return "CUSTOMER"; }
    @Override public String bizName() { return "客户"; }
    @Override public String permission() { return "crm:customer:import"; }
    @Override public Class<CrmCustomer> rowClass() { return CrmCustomer.class; }
    @Override public List<List<String>> uniqueKeys() { return List.of(List.of("customerCode")); }

    @Override
    public List<ImportColumn> columns() {
        return List.of(
                ImportColumn.builder().field("customerCode").name("客户编码").required(true).maxLength(50).example("CUST2026001").build(),
                ImportColumn.builder().field("customerName").name("客户名称").required(true).maxLength(120).example("示例客户").build(),
                ImportColumn.builder().field("ownerId").name("负责人").type(ImportColumn.Type.REFERENCE).reference("CUSTOMER_OWNER").required(true).maxLength(100).example("填写在职员工姓名或工号").build(),
                ImportColumn.builder().field("customerType").name("客户类型").maxLength(30).example("ENTERPRISE").build(),
                ImportColumn.builder().field("levelCode").name("客户等级").type(ImportColumn.Type.REFERENCE).reference("CUSTOMER_LEVEL").maxLength(100).example("NORMAL").build(),
                ImportColumn.builder().field("source").name("客户来源").maxLength(30).options(Map.of("CHANNEL", "渠道", "EVENT", "活动", "REFERRAL", "转介绍")).example("渠道").build(),
                ImportColumn.builder().field("industry").name("行业").maxLength(64).example("企业软件").build(),
                ImportColumn.builder().field("phone").name("联系电话").maxLength(30).example("010-12345678").build(),
                ImportColumn.builder().field("email").name("联系邮箱").type(ImportColumn.Type.EMAIL).maxLength(100).example("customer@example.com").build(),
                ImportColumn.builder().field("website").name("官网").maxLength(255).example("https://example.com").build(),
                ImportColumn.builder().field("province").name("省份").maxLength(64).example("北京市").build(),
                ImportColumn.builder().field("city").name("城市").maxLength(64).example("北京市").build(),
                ImportColumn.builder().field("address").name("地址").maxLength(255).example("客户办公地址").build(),
                ImportColumn.builder().field("annualRevenue").name("企业年营收").type(ImportColumn.Type.DECIMAL).minimum(BigDecimal.ZERO).maximum(new BigDecimal("99999999999999.99")).pattern("[-+]?\\d+(?:\\.\\d{1,2})?").example("1000000.00").build(),
                ImportColumn.builder().field("customerTags").name("客户标签").maxLength(255).example("新增客户,企业").build(),
                ImportColumn.builder().field("remark").name("备注").maxLength(500).example("新增客户").build());
    }

    @Override
    public void prepare(ImportContext context) {
        context.addReferences("CUSTOMER_OWNER", imports.owners(context.getTenantId()));
        context.addReferences("CUSTOMER_LEVEL", imports.levels(context.getTenantId()));
    }

    @Override
    public Set<String> findExistingKeys(List<CrmCustomer> rows, ImportContext context) {
        return imports.existingCustomers(context.getTenantId(), rows.stream().map(CrmCustomer::getCustomerCode).toList()).stream()
                .map(code -> ImportKeys.forFields(uniqueKeys().get(0), code)).collect(Collectors.toSet());
    }

    @Override
    public List<ImportError> validateRow(CrmCustomer row, int rowNo, ImportContext context) { return List.of(); }

    @Override
    public void importRow(CrmCustomer row, int rowNo, ImportContext context) {
        if (!service.createCustomer(row)) throw new ServiceException("客户保存失败");
    }
}
