package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.vo.ObservabilityModels.ErrorTrend;
import com.cloudflow.auth.domain.vo.ObservabilityModels.FrontendEntry;
import com.cloudflow.auth.domain.vo.ObservabilityModels.SlowEndpoint;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface ObservabilityMapper {
    Page<FrontendEntry> frontendTrace(Page<FrontendEntry> page, @Param("tenantId") Long tenantId, @Param("traceId") String traceId);
    List<SlowEndpoint> slowTop(@Param("tenantId") Long tenantId, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, @Param("sort") String sort);
    List<ErrorTrend> errorTrend(@Param("tenantId") Long tenantId, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
    int processError(@Param("tenantId") Long tenantId, @Param("errorId") Long errorId, @Param("expectedStatus") String expectedStatus,
                     @Param("status") String status, @Param("remark") String remark, @Param("userName") String userName);
}
