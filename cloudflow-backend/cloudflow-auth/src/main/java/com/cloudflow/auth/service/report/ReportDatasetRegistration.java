package com.cloudflow.auth.service.report;

import com.cloudflow.auth.domain.report.SysReportDataset;
import com.cloudflow.auth.mapper.report.SysReportDatasetMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportRegistry;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

/** 只在服务启动和新租户创建时补入服务器固定的数据集定义。 */
@Service
@RequiredArgsConstructor
public class ReportDatasetRegistration {
    private final SysReportDatasetMapper mapper;
    private final ObjectMapper json;

    @Transactional(rollbackFor = Exception.class)
    public void registerTenant(Long tenantId) {
        if (tenantId == null || tenantId <= 0 || !Objects.equals(tenantId, UserContext.getTenantId())) {
            throw new IllegalArgumentException("报表注册必须在目标租户上下文执行");
        }
        Set<String> existing = new HashSet<>();
        for (SysReportDataset record : mapper.registered(tenantId)) existing.add(record.getDatasetCode());
        for (ReportDataset definition : ReportRegistry.datasets()) {
            if (existing.contains(definition.code())) continue;
            SysReportDataset record = new SysReportDataset();
            record.setTenantId(tenantId);
            record.setDatasetCode(definition.code());
            record.setDatasetName(definition.name());
            record.setModule(definition.module());
            record.setMapperMethod(definition.mapperMethod());
            record.setPermissionCode(definition.permission());
            record.setRemark(definition.description());
            try {
                record.setFieldMeta(json.writeValueAsString(definition));
                record.setDefaultFilters(json.writeValueAsString(json.createObjectNode()
                        .put("rollingDays", definition.timeBased() ? 90 : 0)));
            } catch (JsonProcessingException failure) {
                throw new ServiceException("报表注册定义无法保存", 500);
            }
            mapper.registerMissing(record);
        }
    }
}
