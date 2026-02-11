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

package cn.joywon.poco.admin.mapper;

import cn.joywon.poco.admin.api.entity.SysFileGroup;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import org.apache.ibatis.annotations.Mapper;

/**
 * 文件分组管理
 *
 * @author lbw
 * @date 2023年07月25日21:31:48
 */
@Mapper
public interface SysFileGroupMapper extends PocoBaseMapper<SysFileGroup> {

}
