package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.auth.domain.SysPost;

/**
 * 岗位信息 Service 接口
 *
 * @author CloudFlow
 */
public interface ISysPostService extends IService<SysPost> {

    /**
     * 校验岗位编码是否唯一
     *
     * @param post 岗位信息
     * @return true=唯一 false=不唯一
     */
    boolean checkPostCodeUnique(SysPost post);
}
