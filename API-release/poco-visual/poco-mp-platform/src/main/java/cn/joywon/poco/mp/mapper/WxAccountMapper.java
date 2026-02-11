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
package cn.joywon.poco.mp.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.mp.entity.WxAccount;
import org.apache.ibatis.annotations.Mapper;

/**
 * 公众号账户
 *
 * @author poco
 * @date 2019-03-26 22:07:53
 */
@Mapper
public interface WxAccountMapper extends PocoBaseMapper<WxAccount> {

}
