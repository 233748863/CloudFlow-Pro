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

package cn.joywon.poco.admin.service;

import cn.joywon.poco.admin.api.entity.SysPost;
import cn.joywon.poco.admin.api.vo.PostExcelVO;
import cn.joywon.poco.common.core.util.R;
import com.baomidou.mybatisplus.extension.service.IService;
import org.springframework.validation.BindingResult;

import java.util.List;

/**
 * 岗位信息表
 *
 * @author fxz
 * @date 2022-03-26 12:50:43
 */
public interface SysPostService extends IService<SysPost> {

	/**
	 * 绑定商家账号岗位
	 *
	 * @param userId 商家平台账号ID
	 */
	void bindMerchantPost(Long userId);

	/**
	 * 导出excel 表格
	 * @return
	 */
	List<PostExcelVO> listPost(SysPost post, Long[] ids);

	/**
	 * 导入岗位
	 * @param excelVOList 岗位列表
	 * @param bindingResult 错误信息列表
	 * @return ok fail
	 */
	R importPost(List<PostExcelVO> excelVOList, BindingResult bindingResult);

}
