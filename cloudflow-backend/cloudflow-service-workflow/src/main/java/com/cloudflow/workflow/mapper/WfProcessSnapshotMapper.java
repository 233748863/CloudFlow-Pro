package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfProcessSnapshot;
import org.apache.ibatis.annotations.Mapper;

/**
 * 9.C: 流程实例快照 Mapper
 */
@Mapper
public interface WfProcessSnapshotMapper extends BaseMapper<WfProcessSnapshot> {
}
