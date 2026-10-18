package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.controller.InnerCrmContractController;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.vo.OaContractTeamView;
import com.cloudflow.oa.service.IOaContractService;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import org.apache.ibatis.mapping.BoundSql;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaCrmContractBoundaryChecks {
    static void run() throws Exception {
        identity(100000L, 1L);
        Jackson2ObjectMapperBuilder builder = new org.springframework.http.converter.json.Jackson2ObjectMapperBuilder();
        new com.cloudflow.oa.config.OaJacksonConfig().oaJacksonCustomizer().customize(builder);
        OaContractTeamView.Member boundaryMember = new com.cloudflow.oa.domain.vo.OaContractTeamView.Member(1L, "合同团队成员", 100L, "OWNER",
                BigDecimal.ONE, BigDecimal.TEN, null, null, null, java.time.LocalDateTime.of(2026, 9, 18, 15, 6, 4));
        String boundaryJson = builder.build().writeValueAsString(boundaryMember);
        check(boundaryJson.contains("\"createTime\":\"2026-09-18T15:06:04\""), "actual OA serializer emits ISO time for cross-service contract team records");
        AtomicReference<OaContract> captured = new AtomicReference<>();
        IOaContractService service = proxy(IOaContractService.class, (method, arguments) -> {
            if ("createContract".equals(method)) {
                captured.set((OaContract) arguments[0]);
                return 17L;
            }
            if ("queryPage".equals(method)) {
                OaContract query = (OaContract) arguments[0];
                captured.set(query);
                OaContract contract = new OaContract();
                contract.setContractId(17L); contract.setCustomerId(9L); contract.setAmount(BigDecimal.TEN);
                contract.setAttachmentUrl("private-attachment"); contract.setArchiveAttachmentUrl("private-archive");
                PageQuery page = (PageQuery) arguments[1];
                return new PageResult<>(List.of(contract), 1L, 1L, page.getPageSize().longValue());
            }
            throw new AssertionError("Unexpected service method: " + method);
        });
        InnerCrmContractController controller = new InnerCrmContractController(null, service);
        InnerCrmContractController.Draft request = new InnerCrmContractController.Draft();
        request.setContractName("CRM草稿"); request.setCounterpartyName("客户"); request.setContractType("SALES");
        request.setCustomerId(9L); request.setAmount(BigDecimal.TEN); request.setSourceType("CRM_CUSTOMER"); request.setSourceId(9L);
        equal(17L, controller.createDraft(request).getData(), "CRM internal draft calls the normal contract creation service");
        equal(9L, captured.get().getCustomerId(), "CRM draft preserves customer identity");
        equal("CRM_CUSTOMER", captured.get().getSourceType(), "CRM draft preserves bounded origin");
        equal(null, captured.get().getTenantId(), "caller body cannot provide draft tenant");
        Set<String> fields = Arrays.stream(InnerCrmContractController.Draft.class.getDeclaredFields()).map(java.lang.reflect.Field::getName).collect(Collectors.toSet());
        check(java.util.Collections.disjoint(fields, Set.of("tenantId", "contractId", "status", "approvedTime", "attachmentUrl", "archiveAttachmentUrl")), "draft DTO excludes protected fields");
        equal(17L, controller.detail(17L).getData().contractId(), "CRM contract read returns a bounded summary");
        equal(17L, captured.get().getContractId(), "CRM detail uses data-scoped contract paging");
        PageQuery page = new PageQuery(); page.setPageSize(20);
        equal(1L, controller.list(9L, "DRAFT", page).getData().getTotal(), "CRM contract list preserves pagination");
        equal(9L, captured.get().getCustomerId(), "CRM contract list requires requested customer");
        equal("DRAFT", captured.get().getStatus(), "CRM contract list preserves status filter");
        MybatisConfiguration configuration = new com.baomidou.mybatisplus.core.MybatisConfiguration();
        try (InputStream stream = org.apache.ibatis.io.Resources.getResourceAsStream("mapper/OaContractMapper.xml")) {
            new org.apache.ibatis.builder.xml.XMLMapperBuilder(stream, configuration, "mapper/OaContractMapper.xml", configuration.getSqlFragments()).parse();
        }
        BoundSql sql = configuration.getMappedStatement("com.cloudflow.oa.mapper.OaContractMapper.selectPageByDataScope")
                .getBoundSql(java.util.Map.of("query", captured.get()));
        check(sql.getSql().contains("customer_id = ?"), "production contract list SQL applies the requested customer filter");
        check(sql.getParameterMappings().stream().anyMatch(mapping -> "query.customerId".equals(mapping.getProperty())), "customer filter uses a bound parameter");
        Set<String> summary = Arrays.stream(InnerCrmContractController.Summary.class.getRecordComponents()).map(java.lang.reflect.RecordComponent::getName).collect(Collectors.toSet());
        check(java.util.Collections.disjoint(summary, Set.of("attachmentUrl", "archiveAttachmentUrl", "terms", "tenantId")), "CRM summary does not expose contract files or terms");
        for (String name : List.of("createDraft", "detail", "list")) {
            Method method = Arrays.stream(InnerCrmContractController.class.getDeclaredMethods()).filter(candidate -> candidate.getName().equals(name)).findFirst().orElseThrow();
            equal(List.of("cloudflow-service-crm"), Arrays.asList(method.getAnnotation(Inner.class).allowedServices()), "CRM contract endpoint has exact caller allowlist: " + name);
        }
        UserContext.setUserId(null);
        equal(403, controller.createDraft(request).getCode(), "background service cannot create a user contract without actor context");
        equal(403, controller.detail(17L).getCode(), "background service cannot read user-scoped contracts without actor context");
        identity(100000L, 1L);
    }
}
