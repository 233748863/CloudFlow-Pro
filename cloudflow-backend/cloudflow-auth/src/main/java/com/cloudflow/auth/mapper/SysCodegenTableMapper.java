package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.cloudflow.auth.domain.SysCodegenTable;
import com.cloudflow.auth.domain.vo.DbColumnMetadataVO;
import com.cloudflow.auth.domain.vo.DbTableVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 代码生成表配置 Mapper。
 */
@Mapper
public interface SysCodegenTableMapper extends BaseMapper<SysCodegenTable> {

    @InterceptorIgnore(tenantLine = "true")
    SysCodegenTable selectIncludingDeleted(@Param("tenantId") Long tenantId,
                                           @Param("tableName") String tableName);

    int markDeleted(@Param("table") SysCodegenTable table);

    int restoreDeleted(@Param("table") SysCodegenTable table);

    @InterceptorIgnore(tenantLine = "true")
    List<DbTableVO> selectDatabaseTables(@Param("tableName") String tableName,
                                         @Param("tableComment") String tableComment,
                                         @Param("tenantId") Long tenantId);

    @InterceptorIgnore(tenantLine = "true")
    DbTableVO selectDatabaseTable(@Param("tableName") String tableName);

    @InterceptorIgnore(tenantLine = "true")
    List<DbColumnMetadataVO> selectDatabaseColumns(@Param("tableName") String tableName);
}
