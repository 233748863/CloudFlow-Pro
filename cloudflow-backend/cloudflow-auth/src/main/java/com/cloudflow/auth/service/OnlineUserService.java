package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.dto.OnlineUserDTO;
import com.cloudflow.auth.domain.dto.OnlineUserQuery;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;

import java.util.List;

/**
 * 在线用户服务。
 */
public interface OnlineUserService {

    /**
     * 分页查询在线用户。
     */
    PageResult<OnlineUserDTO> selectOnlineUserPage(OnlineUserQuery query, PageQuery pageQuery);

    /**
     * 强制下线指定会话。
     *
     * @return 成功下线的会话数量
     */
    int forceLogout(List<String> tokens);
}
