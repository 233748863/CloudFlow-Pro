package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysUserTotp;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SysUserTotpMapper extends BaseMapper<SysUserTotp> {
}
