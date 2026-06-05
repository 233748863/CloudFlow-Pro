package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfProcessVersionSnapshot;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 流程版本快照Mapper接口
 */
@Mapper
public interface WfProcessVersionSnapshotMapper extends BaseMapper<WfProcessVersionSnapshot> {

    List<WfProcessVersionSnapshot> listByProcessDefId(@Param("processDefId") String processDefId);

    List<WfProcessVersionSnapshot> listByProcessKey(@Param("processKey") String processKey);

    WfProcessVersionSnapshot selectByProcessDefIdAndVersion(@Param("processDefId") String processDefId, @Param("version") Integer version);

    WfProcessVersionSnapshot selectByProcessKeyAndVersion(@Param("processKey") String processKey, @Param("version") Integer version);

    WfProcessVersionSnapshot selectByDeployId(@Param("deployId") Long deployId);

    WfProcessVersionSnapshot selectLatestByProcessDefId(@Param("processDefId") String processDefId);
}
