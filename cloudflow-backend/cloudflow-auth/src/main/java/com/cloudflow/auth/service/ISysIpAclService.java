package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysIpAcl;

import java.util.List;

/**
 * GOV-P0-1 IP 黑白名单服务。
 */
public interface ISysIpAclService {

    Page<SysIpAcl> page(String keyword, String mode, String status, Integer pageNum, Integer pageSize);

    SysIpAcl getById(Long id);

    boolean save(SysIpAcl rule);

    boolean update(SysIpAcl rule);

    boolean remove(Long id);

    boolean toggleStatus(Long id, String status);

    /** 返回当前所有 ACTIVE 且未过期规则,按 priority 升序。 */
    List<SysIpAcl> listActive();

    /** 把当前所有 ACTIVE 规则写入 Redis + 发布 RELOAD 通知。 */
    void publishAllToGateway();
}
