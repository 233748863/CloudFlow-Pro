package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.search.BusinessSearchRow;
import com.cloudflow.workflow.domain.WfTask;
import java.util.List;
import java.util.Set;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WorkflowBusinessSearchMapper {
    List<WfTask> proxyTasks(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("pattern") String pattern);
    Page<BusinessSearchRow> instances(Page<BusinessSearchRow> page, @Param("tenantId") Long tenantId,
            @Param("userId") Long userId, @Param("pattern") String pattern, @Param("admin") boolean admin,
            @Param("agentInstances") Set<String> agentInstances);
}
