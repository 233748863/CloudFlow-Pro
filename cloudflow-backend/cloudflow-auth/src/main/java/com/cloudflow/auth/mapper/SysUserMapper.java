package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysUser;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {
}
