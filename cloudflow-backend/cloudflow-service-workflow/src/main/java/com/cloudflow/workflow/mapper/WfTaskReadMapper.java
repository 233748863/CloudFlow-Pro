package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTaskRead;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WfTaskReadMapper extends BaseMapper<WfTaskRead> {
    int insertIfAbsent(@Param("read") WfTaskRead read);
}
