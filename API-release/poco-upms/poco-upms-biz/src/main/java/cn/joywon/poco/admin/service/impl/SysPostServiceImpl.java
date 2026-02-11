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
package cn.joywon.poco.admin.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ArrayUtil;
import cn.joywon.poco.admin.api.entity.SysPost;
import cn.joywon.poco.admin.api.entity.SysUserPost;
import cn.joywon.poco.admin.api.vo.PostExcelVO;
import cn.joywon.poco.admin.mapper.SysPostMapper;
import cn.joywon.poco.admin.mapper.SysUserPostMapper;
import cn.joywon.poco.admin.service.SysPostService;
import cn.joywon.poco.common.core.exception.ErrorCodes;
import cn.joywon.poco.common.core.util.MsgUtils;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.vo.ErrorMessage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.BindingResult;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 岗位信息表
 *
 * @author fxz
 * @date 2022-03-26 12:50:43
 */
@Service
@RefreshScope
@RequiredArgsConstructor
public class SysPostServiceImpl extends ServiceImpl<SysPostMapper, SysPost> implements SysPostService {

	@Value("${ma.merchant.post_id}")
	private Long merchantPostId;

	private final SysUserPostMapper sysUserPostMapper;

	/**
	 * 绑定商家账号岗位
	 *
	 * @param userId 商家平台账号ID
	 */
	@Override
	@Transactional(rollbackFor = Exception.class)
	public void bindMerchantPost(Long userId) {
		SysUserPost userPost = new SysUserPost();
		userPost.setUserId(userId);
		userPost.setPostId(merchantPostId);
		int row = sysUserPostMapper.insert(userPost);
		Assert.isTrue(row > 0, () -> new RuntimeException("创建商家过程失败: 商家岗位绑定失败"));
	}

	/**
	 * 导入岗位
	 * @param excelVOList 岗位列表
	 * @param bindingResult 错误信息列表
	 * @return ok fail
	 */
	@Override
	public R importPost(List<PostExcelVO> excelVOList, BindingResult bindingResult) {
		// 通用校验获取失败的数据
		List<ErrorMessage> errorMessageList = (List<ErrorMessage>) bindingResult.getTarget();

		// 个性化校验逻辑
		List<SysPost> postList = this.list();

		// 执行数据插入操作 组装 PostDto
		for (PostExcelVO excel : excelVOList) {
			Set<String> errorMsg = new HashSet<>();
			// 检验岗位名称或者岗位编码是否存在
			boolean existPost = postList.stream()
				.anyMatch(post -> excel.getPostName().equals(post.getPostName())
						|| excel.getPostCode().equals(post.getPostCode()));

			if (existPost) {
				errorMsg.add(MsgUtils.getMessage(ErrorCodes.SYS_POST_NAMEORCODE_EXISTING, excel.getPostName(),
						excel.getPostCode()));
			}

			// 数据合法情况
			if (CollUtil.isEmpty(errorMsg)) {
				insertExcelPost(excel);
			}
			else {
				// 数据不合法
				errorMessageList.add(new ErrorMessage(excel.getLineNum(), errorMsg));
			}
		}
		if (CollUtil.isNotEmpty(errorMessageList)) {
			return R.failed(errorMessageList);
		}
		return R.ok();
	}

	/**
	 * 导出excel 表格
	 * @return
	 */
	@Override
	public List<PostExcelVO> listPost(SysPost query, Long[] ids) {
		List<SysPost> postList = this
			.list(Wrappers.lambdaQuery(query).in(ArrayUtil.isNotEmpty(ids), SysPost::getPostId, CollUtil.toList(ids)));
		// 转换成execl 对象输出
		return postList.stream().map(post -> {
			PostExcelVO postExcelVO = new PostExcelVO();
			BeanUtil.copyProperties(post, postExcelVO);
			return postExcelVO;
		}).collect(Collectors.toList());
	}

	/**
	 * 插入excel Post
	 */
	private void insertExcelPost(PostExcelVO excel) {
		SysPost sysPost = new SysPost();
		BeanUtil.copyProperties(excel, sysPost);
		this.save(sysPost);
	}

}
