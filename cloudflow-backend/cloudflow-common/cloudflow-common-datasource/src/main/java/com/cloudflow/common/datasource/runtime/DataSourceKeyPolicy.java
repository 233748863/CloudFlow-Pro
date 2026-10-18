package com.cloudflow.common.datasource.runtime;

import com.baomidou.dynamic.datasource.DynamicRoutingDataSource;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DataSourceKeyPolicy {
    private final DynamicRoutingDataSource routing;
    private final String primary;

    public DataSourceKeyPolicy(DynamicRoutingDataSource routing,
            @Value("${spring.datasource.dynamic.primary:master}") String primary) {
        this.routing = routing;
        this.primary = primary;
    }

    public void validate(String key, Long configId) {
        if (key == null || !key.matches("[a-z][a-z0-9-]{0,63}")) {
            throw new DataSourceFailure("INVALID_KEY", "注册键仅允许小写字母、数字及连字符，须以字母开头", 400);
        }
        Set<String> reserved = new HashSet<>(Set.of("master", "default", "primary"));
        reserved.add(primary.toLowerCase(Locale.ROOT));
        for (String group : routing.getGroupDataSources().keySet()) reserved.add(group.toLowerCase(Locale.ROOT));
        routing.getDataSources().forEach((name, source) -> {
            if (!(source instanceof ManagedRuntimeDataSource managed) || configId == null || managed.configId() != configId) {
                reserved.add(name.toLowerCase(Locale.ROOT));
            }
        });
        if (reserved.contains(key)) throw new DataSourceFailure("RESERVED_KEY", "禁止覆盖主库、默认源或既有命名数据源", 409);
    }
}
