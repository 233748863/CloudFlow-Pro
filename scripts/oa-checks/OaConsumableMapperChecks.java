package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.plugins.IgnoreStrategy;
import com.baomidou.mybatisplus.core.plugins.InterceptorIgnoreHelper;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.cloudflow.common.datascope.DataScopeInnerInterceptor;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.mapper.OaConsumableLedgerMapper;
import com.cloudflow.oa.mapper.OaConsumableMaintenanceMapper;
import com.cloudflow.oa.mapper.OaConsumablePurchaseMapper;
import com.cloudflow.oa.mapper.OaConsumableRequestItemMapper;
import java.io.InputStream;
import java.lang.reflect.Method;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.RowBounds;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

public final class OaConsumableMapperChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        Map<Class<? extends Object>, String> mappers = Map.of(OaConsumableRequestItemMapper.class, "lockItems",
                OaConsumablePurchaseMapper.class, "lockItems", OaConsumableMaintenanceMapper.class, "risks");
        for (Map.Entry<Class<? extends Object>, String> entry : mappers.entrySet()) {
            Class<?> mapper = entry.getKey();
            String resource = "src/main/resources/mapper/" + mapper.getSimpleName() + ".xml";
            try (InputStream input = Files.newInputStream(Path.of(resource))) {
                new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
            }
            verify(mapper.getAnnotation(InterceptorIgnore.class) == null, "no mapper-wide tenant bypass");
            IgnoreStrategy strategy = InterceptorIgnoreHelper.initSqlParserInfoCache(mapper);
            for (Method method : mapper.getDeclaredMethods()) {
                InterceptorIgnoreHelper.initSqlParserInfoCache(strategy, mapper.getName(), method);
                if (!method.getName().equals(entry.getValue())) {
                    verify(method.getAnnotation(InterceptorIgnore.class) == null, "other queries retain tenant interception");
                }
            }
            MappedStatement statement = configuration.getMappedStatement(mapper.getName() + "." + entry.getValue());
            for (Long tenantId : List.of(100000L, 100001L)) {
                Map<String, Long> parameters = Map.of("tenantId", tenantId, "requestId", 102L, "purchaseId", 103L, "id", 104L);
                BoundSql bound = statement.getBoundSql(parameters);
                String original = bound.getSql();
                verify(original.matches("(?s).*tenant_id\\s*=\\s*\\?.*"), "explicit tenant condition");
                verify(bound.getParameterMappings().stream().anyMatch(parameter -> "tenantId".equals(parameter.getProperty())),
                        "bound tenant parameter");
                verify(original.trim().endsWith("FOR UPDATE"), "source lock follows ordering");
                TenantLineInnerInterceptor interceptor = new TenantLineInnerInterceptor(new TenantLineHandler() {
                    @Override
                    public Expression getTenantId() { return new LongValue(tenantId); }
                });
                interceptor.beforeQuery(null, statement, parameters, RowBounds.DEFAULT, null, bound);
                verify(bound.getSql().trim().endsWith("FOR UPDATE"), mapper.getSimpleName() + " keeps valid lock ordering");
                verify(original.equals(bound.getSql()), "explicitly scoped locking SQL is preserved");
                verify(parameters.get("tenantId").equals(tenantId), "requested tenant is unchanged");
            }
        }
        reportScopes(configuration);
        System.out.println("PASS: OA-08 mapper checks = " + checks);
    }

    private static void reportScopes(MybatisConfiguration configuration) throws Exception {
        String resource = "src/main/resources/mapper/OaConsumableLedgerMapper.xml";
        try (InputStream input = Files.newInputStream(Path.of(resource))) {
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        MappedStatement statement = configuration.getMappedStatement(OaConsumableLedgerMapper.class.getName() + ".usageReport");
        for (Long tenantId : List.of(100000L, 100001L)) {
            for (String group : List.of("CONSUMABLE", "DEPARTMENT", "PERSON")) {
                for (String mode : List.of("ALL", "DEPARTMENT", "SELF", "COMBINED", "NONE")) {
                    ConsumableQuery query = new ConsumableQuery();
                    query.setGroupBy(group);
                    query.setDeptId(101L);
                    query.setApplicantId(201L);
                    HashMap<String, Object> parameters = new HashMap<String, Object>();
                    parameters.put("tenantId", tenantId);
                    parameters.put("query", query);
                    parameters.put("allData", "ALL".equals(mode));
                    parameters.put("scopeDeptIds", List.of("DEPARTMENT", "COMBINED").contains(mode) ? List.of(101L, 102L) : List.of());
                    parameters.put("scopeUserId", List.of("SELF", "COMBINED").contains(mode) ? 201L : null);
                    BoundSql bound = statement.getBoundSql(parameters);
                    String original = bound.getSql();
                    new DataScopeInnerInterceptor(scope -> { throw new AssertionError("aggregate must use already resolved scope"); })
                            .beforeQuery(null, statement, parameters, RowBounds.DEFAULT, null, bound);
                    verify(original.equals(bound.getSql()), "aggregate is never wrapped with missing scope columns");
                    TenantLineInnerInterceptor tenant = new TenantLineInnerInterceptor(new TenantLineHandler() {
                        @Override
                        public Expression getTenantId() { return new LongValue(tenantId); }
                    });
                    tenant.beforeQuery(null, statement, parameters, RowBounds.DEFAULT, null, bound);
                    String sql = bound.getSql().replaceAll("\\s+", " ");
                    String filter = sql.substring(sql.indexOf(" WHERE "), sql.indexOf(" GROUP BY "));
                    verify(filter.contains("tenant_id = ?"), "usage source keeps explicit bound tenant");
                    verify(filter.contains("dept_id = ?") && filter.contains("beneficiary_id = ?"), "caller filters only narrow authorized source rows");
                    verify(!sql.contains("temp_data_scope"), "scope is applied before all three aggregation modes");
                    verify(filter.contains("1 = 0") != "ALL".equals(mode), "empty scope denies every source row");
                    verify(filter.contains("OR beneficiary_id = ?") == List.of("SELF", "COMBINED").contains(mode), "self scope filters source beneficiary");
                    verify(filter.contains("OR dept_id IN") == List.of("DEPARTMENT", "COMBINED").contains(mode), "department scope filters source departments");
                    verify(bound.getParameterMappings().stream().anyMatch(parameter -> "scopeUserId".equals(parameter.getProperty()))
                            == List.of("SELF", "COMBINED").contains(mode), "scope identities remain SQL parameters");
                }
            }
        }
    }

    private static void verify(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
}
