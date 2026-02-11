/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.codegen.mapper;

import cn.joywon.poco.codegen.entity.GenFieldType;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Set;

/**
 * 列属性
 *
 * @author poco code generator
 * @date 2023-02-06 20:16:01
 */
@Mapper
public interface GenFieldTypeMapper extends PocoBaseMapper<GenFieldType> {

	/**
	 * 根据tableId，获取包列表
	 * @param dsName 数据源名称
	 * @param tableName 表名称
	 * @return 返回包列表
	 */
	Set<String> getPackageByTableId(@Param("dsName") String dsName, @Param("tableName") String tableName);

}
