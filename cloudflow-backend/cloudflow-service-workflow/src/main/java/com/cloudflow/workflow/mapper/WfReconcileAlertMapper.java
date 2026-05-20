package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfReconcileAlert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface WfReconcileAlertMapper extends BaseMapper<WfReconcileAlert> {

    List<WfReconcileAlert> selectInconsistentRecords(@Param("windowMinutes") int windowMinutes);
}
