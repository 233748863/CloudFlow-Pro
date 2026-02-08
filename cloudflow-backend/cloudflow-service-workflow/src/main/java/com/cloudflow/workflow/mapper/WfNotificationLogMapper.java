package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfNotificationLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WfNotificationLogMapper extends BaseMapper<WfNotificationLog> {
}
