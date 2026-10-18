package com.cloudflow.crm.importing;

import com.baomidou.mybatisplus.core.metadata.OrderItem;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.excel.importing.ImportColumn;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportDefinition;
import com.cloudflow.common.excel.importing.ImportError;
import com.cloudflow.common.excel.importing.ImportHandler;
import com.cloudflow.common.excel.importing.ImportIdentity;
import com.cloudflow.common.excel.importing.ImportReference;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.mapper.CrmImportMapper;
import com.cloudflow.crm.service.ICrmOpportunityService;
import com.cloudflow.crm.service.opportunity.CrmSalesStageService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OpportunityImport implements ImportDefinition<OpportunityImport.RowData>, ImportHandler<OpportunityImport.RowData> {
    private static final String CUSTOMERS = "OPPORTUNITY_CUSTOMER";
    private static final String OWNERS = "OPPORTUNITY_OWNER";
    private static final String CONTACTS = "OPPORTUNITY_CONTACT";
    private static final String STAGES = "OPPORTUNITY_STAGE";
    private final CrmImportMapper imports;
    private final ICrmOpportunityService service;
    private final CrmSalesStageService stages;
    private final ImportIdentity identity;

    @Override public String bizType() { return "OPPORTUNITY"; }
    @Override public String bizName() { return "商机"; }
    @Override public String permission() { return "crm:opportunity:import"; }
    @Override public String updatePermission() { return "crm:opportunity:edit"; }
    @Override public Class<RowData> rowClass() { return RowData.class; }
    @Override public List<List<String>> uniqueKeys() { return List.of(List.of("opportunityId")); }

    @Override
    public List<String> instructions() {
        return List.of(
                "同一文件可新增和更新商机；请先校验，确认后再导入。",
                "新增行选择“新增”，填写客户和商机名称，商机编号及数据版本留空；更新行请保留更新模板中的编号和版本。",
                "更新行的空白字段保留原值；记录已被修改时停止该行写入，请重新下载核对。阶段与跟进要求沿用商机页面规则。",
                "更新模板仅包含本人负责且可访问的进行中商机；已有产品明细时，预计金额按产品计算。");
    }

    @Override
    public List<ImportColumn> columns() {
        Map<String, String> operations = new LinkedHashMap<>();
        operations.put("CREATE", "新增");
        operations.put("UPDATE", "更新");
        return List.of(
                ImportColumn.builder().field("operation").name("操作").required(true).options(operations).example("新增").build(),
                ImportColumn.builder().field("opportunityId").name("商机编号").type(ImportColumn.Type.INTEGER).minimum(BigDecimal.ONE)
                        .maximum(new BigDecimal(Long.MAX_VALUE)).example("").build(),
                ImportColumn.builder().field("version").name("数据版本").type(ImportColumn.Type.INTEGER).minimum(BigDecimal.ZERO)
                        .maximum(new BigDecimal(Integer.MAX_VALUE)).example("").build(),
                ImportColumn.builder().field("customerId").name("客户").type(ImportColumn.Type.REFERENCE).reference(CUSTOMERS).maxLength(120).example("填写客户编码或名称").build(),
                ImportColumn.builder().field("opportunityName").name("商机名称").maxLength(120).example("年度服务采购").build(),
                ImportColumn.builder().field("ownerId").name("负责人").type(ImportColumn.Type.REFERENCE).reference(OWNERS).maxLength(100).example("留空使用当前负责人").build(),
                ImportColumn.builder().field("contactId").name("联系人").type(ImportColumn.Type.REFERENCE).reference(CONTACTS).maxLength(200).example("填写下拉选项或联系人编号").build(),
                ImportColumn.builder().field("stage").name("目标阶段").type(ImportColumn.Type.REFERENCE).reference(STAGES).maxLength(100).example("留空使用初始或当前阶段").build(),
                ImportColumn.builder().field("expectedAmount").name("预计金额").type(ImportColumn.Type.DECIMAL).minimum(BigDecimal.ZERO)
                        .maximum(new BigDecimal("999999999999.99")).pattern("\\d+(?:\\.\\d{1,2})?").example("10000.00").build(),
                ImportColumn.builder().field("winRate").name("赢率百分数").type(ImportColumn.Type.DECIMAL).minimum(BigDecimal.ZERO)
                        .maximum(new BigDecimal("100")).pattern("\\d+(?:\\.\\d{1,2})?").example("").build(),
                ImportColumn.builder().field("expectedSignDate").name("预计签约日期").type(ImportColumn.Type.DATE).example("2026-12-01").build(),
                ImportColumn.builder().field("source").name("商机来源").maxLength(30).example("转介绍").build(),
                ImportColumn.builder().field("remark").name("备注").maxLength(500).example("").build());
    }

    @Override
    public void prepare(ImportContext context) {
        requireIdentity(context, permission());
        context.addReferences(CUSTOMERS, imports.opportunityCustomers(context.getTenantId(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
        context.addReferences(OWNERS, imports.owners(context.getTenantId()));
        context.addReferences(CONTACTS, imports.opportunityContacts(context.getTenantId(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
        context.addReferences(STAGES, stages.options().stream()
                .map(stage -> new ImportReference(stage.getStageCode(), stage.getStageName(), stage.getStageCode())).toList());
    }

    @Override
    public List<ImportError> validateRow(RowData row, int rowNo, ImportContext context) {
        try {
            CrmOpportunity request = request(row, context);
            CrmOpportunity preview = service.previewImport(request);
            checkProductAmount(row, preview);
            return List.of();
        } catch (IllegalArgumentException | ServiceException failure) {
            if (failure instanceof ServiceException serviceFailure && Objects.equals(serviceFailure.getCode(), 503)) throw serviceFailure;
            return List.of(businessError(rowNo, failure));
        }
    }

    @Override
    public void importRow(RowData row, int rowNo, ImportContext context) {
        CrmOpportunity request = request(row, context);
        checkProductAmount(row, service.previewImport(request));
        boolean saved = "CREATE".equals(row.getOperation()) ? service.createOpportunity(request) : service.updateOpportunity(request);
        if (!saved) throw new ServiceException("商机保存失败，请重新核对该行");
    }

    @Override
    public ImportError importFailure(RowData row, int rowNo, RuntimeException failure) {
        return failure instanceof IllegalArgumentException || failure instanceof ServiceException
                ? businessError(rowNo, failure) : ImportHandler.super.importFailure(row, rowNo, failure);
    }

    private CrmOpportunity request(RowData row, ImportContext context) {
        boolean creating = "CREATE".equals(row.getOperation());
        if (!creating && !"UPDATE".equals(row.getOperation())) throw new ServiceException("操作必须为新增或更新", 400);
        requireIdentity(context, permission());
        requireIdentity(context, creating ? "crm:opportunity:add" : updatePermission());
        if (creating && (row.getOpportunityId() != null || row.getVersion() != null))
            throw new ServiceException("新增行的商机编号和数据版本必须留空", 400);
        if (!creating && (row.getOpportunityId() == null || row.getVersion() == null))
            throw new ServiceException("更新行须保留更新模板中的商机编号和数据版本", 400);
        if (creating && (row.getCustomerId() == null || row.getOpportunityName() == null || row.getOpportunityName().isBlank()))
            throw new ServiceException("新增商机须填写客户和商机名称", 400);
        CrmOpportunity request = new CrmOpportunity();
        if (!creating) {
            BeanUtils.copyProperties(service.getAccessibleOpportunity(row.getOpportunityId()), request);
            // Never replace the exported version with the current database version.
            request.setVersion(row.getVersion());
        }
        if (row.getCustomerId() != null) request.setCustomerId(row.getCustomerId());
        if (row.getOpportunityName() != null) request.setOpportunityName(row.getOpportunityName());
        if (row.getOwnerId() != null) request.setOwnerId(row.getOwnerId());
        if (row.getContactId() != null) request.setContactId(row.getContactId());
        if (row.getStage() != null) request.setStage(row.getStage());
        if (row.getExpectedAmount() != null) request.setExpectedAmount(row.getExpectedAmount());
        if (row.getWinRate() != null) request.setWinRate(row.getWinRate());
        if (row.getExpectedSignDate() != null) request.setExpectedSignDate(row.getExpectedSignDate());
        if (row.getSource() != null) request.setSource(row.getSource());
        if (row.getRemark() != null) request.setRemark(row.getRemark());
        return request;
    }

    private void requireIdentity(ImportContext context, String requiredPermission) {
        ImportIdentity.Operator operator = identity.require(requiredPermission);
        if (operator.tenantId() != context.getTenantId() || operator.userId() != context.getOperatorId())
            throw new ServiceException("导入操作人身份已改变，请重新登录", 403);
    }

    private void checkProductAmount(RowData row, CrmOpportunity prepared) {
        if ("UPDATE".equals(row.getOperation()) && row.getExpectedAmount() != null
                && row.getExpectedAmount().compareTo(prepared.getExpectedAmount()) != 0)
            throw new ServiceException("已有产品明细，预计金额须与产品合计一致；请在商机详情调整产品", 400);
    }

    private ImportError businessError(int rowNo, RuntimeException failure) {
        return new ImportError(rowNo, null, null, "BUSINESS", failure.getMessage());
    }

    @Override
    public List<Map<String, String>> updateTemplateRows(ImportContext context, String keyword) {
        requireIdentity(context, updatePermission());
        Map<String, String> customerCodes = referenceCodes(context, CUSTOMERS);
        Map<String, String> ownerCodes = referenceCodes(context, OWNERS);
        Map<String, String> contactCodes = referenceCodes(context, CONTACTS);
        List<Map<String, String>> rows = new ArrayList<>();
        long afterId = 0;
        while (true) {
            Page<CrmOpportunity> page = new Page<CrmOpportunity>(1, 200, false).addOrder(OrderItem.asc("opportunity_id"));
            List<CrmOpportunity> current = imports.updateOpportunities(page, context.getTenantId(), context.getOperatorId(), afterId,
                    keyword == null ? null : keyword.trim(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")).getRecords();
            if (current.isEmpty()) break;
            for (CrmOpportunity opportunity : current) {
                if (!Objects.equals(opportunity.getOwnerId(), context.getOperatorId()) || opportunity.getOpportunityId() <= afterId)
                    throw new IllegalStateException("更新模板查询范围或顺序异常");
                Map<String, String> values = new LinkedHashMap<>();
                values.put("operation", "更新");
                values.put("opportunityId", opportunity.getOpportunityId().toString());
                values.put("version", opportunity.getVersion().toString());
                values.put("customerId", requiredCode(customerCodes, opportunity.getCustomerId(), "客户"));
                values.put("opportunityName", opportunity.getOpportunityName());
                values.put("ownerId", requiredCode(ownerCodes, opportunity.getOwnerId(), "负责人"));
                values.put("contactId", opportunity.getContactId() == null ? "" : contactCodes.getOrDefault(opportunity.getContactId().toString(), ""));
                values.put("stage", opportunity.getStage());
                values.put("expectedAmount", opportunity.getExpectedAmount().toPlainString());
                values.put("winRate", opportunity.getWinRate().toPlainString());
                values.put("expectedSignDate", opportunity.getExpectedSignDate() == null ? "" : opportunity.getExpectedSignDate().toString());
                values.put("source", opportunity.getSource());
                values.put("remark", opportunity.getRemark());
                rows.add(values);
                afterId = opportunity.getOpportunityId();
                if (rows.size() > maxRows()) throw new ServiceException("更新记录超过" + maxRows() + "行，请按商机名称缩小筛选范围", 400);
            }
        }
        if (rows.isEmpty()) throw new ServiceException("当前筛选下没有本人负责且可更新的商机", 400);
        return rows;
    }

    private Map<String, String> referenceCodes(ImportContext context, String type) {
        return context.getReferences().getOrDefault(type, List.of()).stream().collect(Collectors.toMap(
                reference -> String.valueOf(reference.value()), ImportReference::code, (first, second) -> first, LinkedHashMap::new));
    }

    private String requiredCode(Map<String, String> codes, Long value, String label) {
        String code = value == null ? null : codes.get(value.toString());
        if (code == null) throw new ServiceException(label + "引用已变化，请核对商机后重新下载模板", 400);
        return code;
    }

    @Data
    public static class RowData {
        private String operation;
        private Long opportunityId;
        private Integer version;
        private Long customerId;
        private String opportunityName;
        private Long ownerId;
        private Long contactId;
        private String stage;
        private BigDecimal expectedAmount;
        private BigDecimal winRate;
        private LocalDate expectedSignDate;
        private String source;
        private String remark;
    }
}
