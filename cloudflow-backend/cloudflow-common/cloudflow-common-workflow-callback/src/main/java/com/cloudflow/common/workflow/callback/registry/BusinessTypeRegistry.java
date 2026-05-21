package com.cloudflow.common.workflow.callback.registry;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

/**
 * 业务类型注册中心。
 *
 * <p>各业务服务通过 {@link BusinessTypeContributor} 在启动期向本注册中心写入自身的业务类型定义。
 *
 * <p>消费端：
 * <ul>
 *   <li>工作流对账 Job 通过 {@link #all()} 拼接 UNION ALL 反查不一致记录。</li>
 *   <li>前端通过 {@code /wf/business-types} 查询全量业务类型用于过滤器/选择器。</li>
 * </ul>
 *
 * <p>本类线程安全：注册期与读取期均使用 {@link ConcurrentHashMap}。
 */
@Component
public class BusinessTypeRegistry {

    private final Map<String, BusinessTypeDef> registry = new ConcurrentHashMap<>();

    public void register(BusinessTypeDef def) {
        Objects.requireNonNull(def, "BusinessTypeDef 不能为空");
        Objects.requireNonNull(def.getCode(), "BusinessTypeDef.code 不能为空");
        Objects.requireNonNull(def.getModule(), "BusinessTypeDef.module 不能为空");
        Objects.requireNonNull(def.getBusinessTable(), "BusinessTypeDef.businessTable 不能为空");
        registry.put(def.getCode(), def);
    }

    @Nullable
    public BusinessTypeDef get(String code) {
        if (code == null) {
            return null;
        }
        return registry.get(code);
    }

    public Optional<BusinessTypeDef> find(String code) {
        return Optional.ofNullable(get(code));
    }

    public boolean contains(String code) {
        return code != null && registry.containsKey(code);
    }

    public Collection<BusinessTypeDef> all() {
        return Collections.unmodifiableCollection(registry.values());
    }

    public List<BusinessTypeDef> listByModule(String module) {
        if (module == null) {
            return Collections.emptyList();
        }
        return registry.values().stream()
                .filter(d -> module.equalsIgnoreCase(d.getModule()))
                .collect(Collectors.toList());
    }

    public int size() {
        return registry.size();
    }
}
