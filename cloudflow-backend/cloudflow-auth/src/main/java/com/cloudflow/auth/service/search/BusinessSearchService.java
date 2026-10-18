package com.cloudflow.auth.service.search;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.search.BusinessSearchGroup;
import com.cloudflow.common.core.search.BusinessSearchQuery;
import com.cloudflow.common.core.search.BusinessSearchResponse;
import com.cloudflow.common.core.search.BusinessSearchType;
import com.cloudflow.common.security.search.BusinessSearchAccess;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class BusinessSearchService {
    private final Map<String, BusinessSearchRemoteApi> clients;
    private final ExecutorService executor;

    public BusinessSearchService(CrmBusinessSearchClient crm, OaBusinessSearchClient oa, HrBusinessSearchClient hr,
            WorkflowBusinessSearchClient workflow, @Qualifier("businessSearchExecutor") ExecutorService executor) {
        this.clients = new LinkedHashMap<>();
        this.clients.put("crm", crm);
        this.clients.put("oa", oa);
        this.clients.put("hr", hr);
        this.clients.put("workflow", workflow);
        this.executor = executor;
    }

    public BusinessSearchResponse search(BusinessSearchQuery query) {
        BusinessSearchAccess.requireContext();
        Set<BusinessSearchType> allowed = BusinessSearchAccess.allowedTypes();
        Map<BusinessSearchType, BusinessSearchGroup> groups = new EnumMap<>(BusinessSearchType.class);
        for (BusinessSearchType type : BusinessSearchType.values()) {
            groups.put(type, allowed.contains(type) ? BusinessSearchGroup.unavailable(type) : BusinessSearchGroup.forbidden(type));
        }
        Map<String, Future<R<List<BusinessSearchGroup>>>> pending = new LinkedHashMap<>();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        try {
            for (Map.Entry<String, BusinessSearchRemoteApi> client : clients.entrySet()) {
                if (allowed.stream().noneMatch(type -> type.module().equals(client.getKey()))) continue;
                try {
                    pending.put(client.getKey(), executor.submit(() -> client.getValue().search(query.keyword(), query.limitPerType())));
                } catch (RejectedExecutionException unavailable) {
                    continue;
                }
            }
            for (Map.Entry<String, Future<R<List<BusinessSearchGroup>>>> request : pending.entrySet()) {
                try {
                    R<List<BusinessSearchGroup>> response = request.getValue().get(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                    List<BusinessSearchGroup> results = validate(response, request.getKey(), query.limitPerType());
                    for (BusinessSearchGroup group : results) if (allowed.contains(group.type())) groups.put(group.type(), group);
                } catch (ExecutionException | TimeoutException | IllegalArgumentException unavailable) {
                    request.getValue().cancel(true);
                }
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ServiceException("业务搜索已中断，请重新查询", 503);
        } finally {
            for (Future<R<List<BusinessSearchGroup>>> request : pending.values()) if (!request.isDone()) request.cancel(true);
        }
        BusinessSearchAccess.requireContext();
        Set<BusinessSearchType> currentAllowed = BusinessSearchAccess.allowedTypes();
        for (BusinessSearchType type : BusinessSearchType.values()) {
            if (!currentAllowed.contains(type)) groups.put(type, BusinessSearchGroup.forbidden(type));
        }
        return new BusinessSearchResponse(query.keyword(), query.limitPerType(), Arrays.stream(BusinessSearchType.values()).map(groups::get).toList());
    }

    private List<BusinessSearchGroup> validate(R<List<BusinessSearchGroup>> response, String module, int limit) {
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalArgumentException("业务模块暂不可用");
        Set<BusinessSearchType> expected = EnumSet.noneOf(BusinessSearchType.class);
        for (BusinessSearchType type : BusinessSearchType.values()) if (module.equals(type.module())) expected.add(type);
        Set<BusinessSearchType> actual = EnumSet.noneOf(BusinessSearchType.class);
        for (BusinessSearchGroup group : response.getData()) {
            if (group == null || !expected.contains(group.type()) || !actual.add(group.type()) || group.items().size() > limit
                    || group.items().stream().map(item -> item.id()).distinct().count() != group.items().size()) {
                throw new IllegalArgumentException("业务模块结果不完整");
            }
        }
        if (!expected.equals(actual)) throw new IllegalArgumentException("业务模块结果不完整");
        return response.getData();
    }
}
