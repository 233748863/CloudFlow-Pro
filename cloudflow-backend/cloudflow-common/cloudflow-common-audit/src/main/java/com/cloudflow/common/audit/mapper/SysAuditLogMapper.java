package com.cloudflow.common.audit.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import org.apache.ibatis.annotations.Mapper;

/**
 * 审计日志 Mapper
 *
 * @author CloudFlow
 */
@Mapper
public interface SysAuditLogMapper extends BaseMapper<SysAuditLogEntity> {
}
