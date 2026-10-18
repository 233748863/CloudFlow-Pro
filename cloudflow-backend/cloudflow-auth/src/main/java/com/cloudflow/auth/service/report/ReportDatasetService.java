package com.cloudflow.auth.service.report;

import com.cloudflow.auth.domain.report.ReportDefinitionView;
import com.cloudflow.auth.domain.report.SysReportDataset;
import com.cloudflow.auth.mapper.report.SysReportDatasetMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.security.report.ReportAccess;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ReportDatasetService {
    private final SysReportDatasetMapper mapper;
    private final ObjectMapper objectMapper;

    public List<ReportDefinitionView.Dataset> list() {
        ReportAccess.requireContext();
        ensureRegistered();
        List<ReportDefinitionView.Dataset> visible = new ArrayList<>();
        for (ReportDataset definition : ReportRegistry.datasets()) {
            if (!ReportAccess.allowed(definition)) continue;
            SysReportDataset record = mapper.byCode(UserContext.getTenantId(), definition.code());
            validateRegistration(record, definition);
            String availability = availability(record, definition);
            visible.add(new ReportDefinitionView.Dataset(record.getDatasetId(), definition, availability,
                    "AVAILABLE".equals(availability) ? definition.description() : "该数据集已停用或业务口径尚未确认"));
        }
        return List.copyOf(visible);
    }

    public SysReportDataset require(String code) {
        ReportDataset definition = ReportRegistry.require(code);
        ReportAccess.requireDataset(definition);
        ensureRegistered();
        SysReportDataset record = mapper.byCode(UserContext.getTenantId(), code);
        validateRegistration(record, definition);
        if (!"AVAILABLE".equals(availability(record, definition))) throw new ServiceException("报表数据集已停用或业务口径尚未确认", 503);
        return record;
    }

    public SysReportDataset forDefinition(Long id) {
        ReportAccess.requireContext();
        SysReportDataset record = mapper.byId(UserContext.getTenantId(), id);
        if (record == null) throw new ServiceException("报表数据集不存在", 404);
        validateRegistration(record, ReportRegistry.require(record.getDatasetCode()));
        return record;
    }

    public String availability(SysReportDataset record, ReportDataset definition) {
        if (!Objects.equals(record.getDeleted(), 0) || !"ACTIVE".equals(record.getStatus())) return "DISABLED";
        return ReportAccess.allowed(definition) ? "AVAILABLE" : "NO_DATA_PERMISSION";
    }

    public void validateRegistration(SysReportDataset record, ReportDataset definition) {
        boolean valid = record != null && Objects.equals(record.getTenantId(), UserContext.getTenantId())
                && definition.code().equals(record.getDatasetCode()) && definition.name().equals(record.getDatasetName())
                && definition.module().equals(record.getModule()) && definition.mapperMethod().equals(record.getMapperMethod())
                && definition.permission().equals(record.getPermissionCode()) && Objects.equals(record.getTenantIsolatedFlag(), 1)
                && Objects.equals(record.getDataScopeFlag(), 1);
        if (valid) {
            try {
                valid = objectMapper.valueToTree(definition).equals(objectMapper.readTree(record.getFieldMeta()))
                        && defaults(definition).equals(objectMapper.readTree(record.getDefaultFilters()));
            } catch (JsonProcessingException | IllegalArgumentException exception) { valid = false; }
        }
        if (!valid) throw new ServiceException("报表注册元数据与服务器定义不一致，已拒绝执行", 409);
    }

    private void ensureRegistered() {
        List<SysReportDataset> existing = mapper.registered(UserContext.getTenantId());
        Set<String> codes = new HashSet<>();
        for (SysReportDataset record : existing) codes.add(record.getDatasetCode());
        for (ReportDataset definition : ReportRegistry.datasets()) {
            if (codes.contains(definition.code())) continue;
            SysReportDataset record = new SysReportDataset();
            record.setTenantId(UserContext.getTenantId());
            record.setDatasetCode(definition.code());
            record.setDatasetName(definition.name());
            record.setModule(definition.module());
            record.setMapperMethod(definition.mapperMethod());
            record.setPermissionCode(definition.permission());
            record.setRemark(definition.description());
            try {
                record.setFieldMeta(objectMapper.writeValueAsString(definition));
                record.setDefaultFilters(objectMapper.writeValueAsString(defaults(definition)));
            } catch (JsonProcessingException exception) { throw new ServiceException("报表注册定义无法保存", 500); }
            mapper.registerMissing(record);
        }
    }

    private JsonNode defaults(ReportDataset definition) {
        return objectMapper.createObjectNode().put("rollingDays", definition.timeBased() ? 90 : 0);
    }
}
