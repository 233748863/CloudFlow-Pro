package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.metadata.OrderItem;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.search.BusinessSearchGroup;
import com.cloudflow.common.core.search.BusinessSearchQuery;
import com.cloudflow.common.core.search.BusinessSearchRow;
import com.cloudflow.common.core.search.BusinessSearchType;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.security.search.BusinessSearchAccess;
import com.cloudflow.oa.mapper.OaBusinessSearchMapper;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OaBusinessSearchService {
    private final OaBusinessSearchMapper mapper;

    public List<BusinessSearchGroup> search(BusinessSearchQuery query) {
        BusinessSearchAccess.requireContext();
        List<BusinessSearchGroup> groups = new ArrayList<>();
        for (BusinessSearchType type : List.of(BusinessSearchType.CONTRACT, BusinessSearchType.ASSET)) {
            if (!BusinessSearchAccess.allowed(type)) {
                groups.add(BusinessSearchGroup.forbidden(type));
                continue;
            }
            Page<BusinessSearchRow> page = new Page<BusinessSearchRow>(1, query.limitPerType() + 1, false)
                    .addOrder(OrderItem.desc("id"));
            List<BusinessSearchRow> rows = (type == BusinessSearchType.CONTRACT
                    ? mapper.contracts(page, UserContext.getTenantId(), query.pattern(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"))
                    : mapper.assets(page, UserContext.getTenantId(), query.pattern())).getRecords();
            groups.add(BusinessSearchGroup.available(type, rows, query.limitPerType()));
        }
        return groups;
    }
}
