package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaSealApplication;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 用印申请 Mapper。
 */
@Mapper
public interface OaSealApplicationMapper extends BaseMapper<OaSealApplication> {

    Page<OaSealApplication> selectPageByDataScope(Page<OaSealApplication> page,
                                                  @Param("query") OaSealApplication query,
                                                  @Param("dataScope") DataScope dataScope);
}
