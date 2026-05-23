package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysUserBlacklist;

/**
 * GOV-P0-1 用户黑名单服务。
 */
public interface ISysUserBlacklistService {

    Page<SysUserBlacklist> page(String keyword, String status, Integer pageNum, Integer pageSize);

    SysUserBlacklist getById(Long id);

    boolean ban(SysUserBlacklist rule);

    boolean update(SysUserBlacklist rule);

    boolean remove(Long id);

    boolean unban(Long id);

    /** 检查用户是否被拉黑(Redis 优先, 未命中回退查表)。 */
    boolean isBanned(Long userId);
}
