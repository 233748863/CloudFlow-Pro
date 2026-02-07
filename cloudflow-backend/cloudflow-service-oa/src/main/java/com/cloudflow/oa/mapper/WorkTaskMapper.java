package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.WorkTask;
import org.apache.ibatis.annotations.Mapper;

/**
 * 协作任务 Mapper 接口
 */
@Mapper
public interface WorkTaskMapper extends BaseMapper<WorkTask> {
}
