package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysCodegenColumn;
import org.apache.ibatis.annotations.Mapper;

/**
 * 代码生成字段配置 Mapper。
 */
@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface SysCodegenColumnMapper extends BaseMapper<SysCodegenColumn> {
}
