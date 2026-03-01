package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfAuditLog;
import org.apache.ibatis.annotations.Mapper;

/**
 * 审计日志 Mapper
 * 
 * @author CloudFlow
 */
@Mapper
public interface WfAuditLogMapper extends BaseMapper<WfAuditLog> {
}
