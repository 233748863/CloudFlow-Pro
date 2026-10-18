package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTaskAddSign;
import com.cloudflow.workflow.domain.vo.PendingSignatureVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface WfTaskAddSignMapper extends BaseMapper<WfTaskAddSign> {
    List<WfTaskAddSign> selectPendingForUpdate(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId,
                                              @Param("taskId") String taskId);

    WfTaskAddSign selectForUpdate(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId,
                                 @Param("addSignId") String addSignId);

    Page<PendingSignatureVO> selectPending(Page<PendingSignatureVO> page, @Param("tenantId") Long tenantId,
                                           @Param("userId") Long userId);
}
