package com.cloudflow.workflow.mapper.system;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.system.SysUser;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {
}
