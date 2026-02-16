package com.cloudflow.oa.mapper;

import com.baomidou.dynamic.datasource.annotation.DS;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.datasource.constants.DsConstants;
import com.cloudflow.oa.domain.Visitor;
import org.apache.ibatis.annotations.Mapper;

/**
 * 访客管理 Mapper 接口
 */
@DS(DsConstants.MASTER)
@Mapper
public interface VisitorMapper extends BaseMapper<Visitor> {
}
