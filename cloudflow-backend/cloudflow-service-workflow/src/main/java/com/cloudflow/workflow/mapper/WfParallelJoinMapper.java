package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfParallelJoin;
import org.apache.ibatis.annotations.Mapper;

/**
 * 并行网关汇聚到达记录 Mapper
 *
 * @author CloudFlow
 */
@Mapper
public interface WfParallelJoinMapper extends BaseMapper<WfParallelJoin> {
}
