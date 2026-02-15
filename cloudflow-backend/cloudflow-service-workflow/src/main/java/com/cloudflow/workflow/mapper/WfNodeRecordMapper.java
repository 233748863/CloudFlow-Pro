package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfNodeRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 节点执行记录 Mapper
 */
@Mapper
public interface WfNodeRecordMapper extends BaseMapper<WfNodeRecord> {
}
