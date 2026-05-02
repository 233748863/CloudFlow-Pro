package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 证照借用申请 Mapper。
 */
@Mapper
public interface OaLicenseBorrowMapper extends BaseMapper<OaLicenseBorrow> {

    Page<OaLicenseBorrow> selectPageByDataScope(Page<OaLicenseBorrow> page,
                                                @Param("query") OaLicenseBorrow query,
                                                @Param("dataScope") DataScope dataScope);
}
