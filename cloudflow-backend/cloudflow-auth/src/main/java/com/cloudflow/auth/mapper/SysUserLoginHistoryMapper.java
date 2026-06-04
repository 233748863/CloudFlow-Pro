package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysUserLoginHistory;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SysUserLoginHistoryMapper extends BaseMapper<SysUserLoginHistory> {
}
