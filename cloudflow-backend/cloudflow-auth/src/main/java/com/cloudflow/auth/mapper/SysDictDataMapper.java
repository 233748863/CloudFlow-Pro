package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysDictData;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Mapper;

/**
 * 字典数据 Mapper
 *
 * @author CloudFlow
 */
@Mapper
public interface SysDictDataMapper extends BaseMapper<SysDictData> {

    Long countDictReferences(@Param("tableName") String tableName,
                             @Param("columnName") String columnName,
                             @Param("dictValue") String dictValue);
}
