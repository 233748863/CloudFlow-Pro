package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.metadata.OrderItem;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.search.BusinessSearchGroup;
import com.cloudflow.common.core.search.BusinessSearchQuery;
import com.cloudflow.common.core.search.BusinessSearchRow;
import com.cloudflow.common.core.search.BusinessSearchType;
import com.cloudflow.common.security.search.BusinessSearchAccess;
import com.cloudflow.hr.mapper.HrBusinessSearchMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class HrBusinessSearchService {
    private final HrBusinessSearchMapper mapper;
    private final HrTypedCrudService employees;

    public List<BusinessSearchGroup> search(BusinessSearchQuery query) {
        BusinessSearchAccess.requireContext();
        BusinessSearchType type = BusinessSearchType.EMPLOYEE;
        if (!BusinessSearchAccess.allowed(type)) return List.of(BusinessSearchGroup.forbidden(type));
        Page<BusinessSearchRow> page = new Page<BusinessSearchRow>(1, query.limitPerType() + 1, false)
                .addOrder(OrderItem.desc("id"));
        List<BusinessSearchRow> rows = mapper.employees(page, UserContext.getTenantId(), query.pattern(), employees.employeeReadScope()).getRecords();
        return List.of(BusinessSearchGroup.available(type, rows, query.limitPerType()));
    }
}
