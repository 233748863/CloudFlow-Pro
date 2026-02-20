package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysPost;
import com.cloudflow.auth.mapper.SysPostMapper;
import com.cloudflow.auth.service.ISysPostService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 岗位信息 Service 实现
 *
 * @author CloudFlow
 */
@Service
@RequiredArgsConstructor
public class SysPostServiceImpl extends ServiceImpl<SysPostMapper, SysPost> implements ISysPostService {

    @Override
    public boolean checkPostCodeUnique(SysPost post) {
        // 查询是否存在相同编码的岗位（排除自身）
        LambdaQueryWrapper<SysPost> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysPost::getPostCode, post.getPostCode());
        if (post.getPostId() != null) {
            wrapper.ne(SysPost::getPostId, post.getPostId());
        }
        return this.count(wrapper) == 0;
    }
}
