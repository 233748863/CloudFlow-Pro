package com.cloudflow.common.excel.importing;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ImportRegistry {
    private final Map<String, ImportDefinition<?>> definitions = new LinkedHashMap<>();
    private final Map<String, ImportHandler<?>> handlers = new LinkedHashMap<>();

    public ImportRegistry(List<ImportDefinition<?>> definitionBeans, List<ImportHandler<?>> handlerBeans) {
        definitionBeans.forEach(definition -> {
            if (definitions.putIfAbsent(definition.bizType(), definition) != null) throw new IllegalStateException("导入业务定义重复");
            if (definition.maxRows() < 1 || definition.columns().isEmpty() || definition.columns().size() > 100) throw new IllegalStateException("导入定义行数或列数无效");
            Set<String> fields = definition.columns().stream().map(ImportColumn::getField).collect(java.util.stream.Collectors.toSet());
            if (fields.size() != definition.columns().size() || definition.uniqueKeys().stream().anyMatch(key -> key.isEmpty() || !fields.containsAll(key))) throw new IllegalStateException("导入定义存在重复字段或无效唯一键");
        });
        handlerBeans.forEach(handler -> {
            if (handlers.putIfAbsent(handler.bizType(), handler) != null) throw new IllegalStateException("导入业务处理器重复");
        });
        if (!handlers.keySet().equals(definitions.keySet())) throw new IllegalStateException("导入定义与处理器未成对注册");
    }

    public ImportDefinition<?> require(String type) {
        ImportDefinition<?> definition = definitions.get(type);
        if (definition == null) throw new ServiceException("当前服务不支持该导入业务", 400);
        if (!hasPermission(definition.permission())) throw new ServiceException("无权导入该业务", 403);
        return definition;
    }

    public ImportHandler<?> handler(String type) {
        require(type);
        return handlers.get(type);
    }

    public List<ImportDefinition<?>> available() {
        return definitions.values().stream().filter(definition -> hasPermission(definition.permission())).toList();
    }

    public List<String> types() {
        return List.copyOf(definitions.keySet());
    }

    public static boolean hasPermission(String permission) {
        return UserContext.getPermissions().contains(permission) || UserContext.getPermissions().contains("*:*:*")
                || UserContext.getPermissions().contains("*");
    }
}
