package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.dto.RoleOptionDTO;
import java.util.List;

public interface ISysRoleService {
    List<SysRole> selectRoleList(SysRole role);
    List<RoleOptionDTO> selectRoleOptions();
    SysRole selectRoleById(Long roleId);
    int insertRole(SysRole role);
    int updateRole(SysRole role);
    int deleteRoleByIds(Long[] roleIds);
}
