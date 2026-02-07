package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTaskRead;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WfTaskReadMapper extends BaseMapper<WfTaskRead> {
}
