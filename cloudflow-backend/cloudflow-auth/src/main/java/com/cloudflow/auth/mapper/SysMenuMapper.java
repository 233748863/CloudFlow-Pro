package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysMenu;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface SysMenuMapper extends BaseMapper<SysMenu> {
    
    /**
     * 根据用户ID查询权限标识
     */
    List<String> selectMenuPermsByUserId(Long userId);

    /**
     * 根据用户ID查询菜单树
     */
    List<SysMenu> selectMenuTreeByUserId(Long userId);

    /**
     * 根据角色ID查询菜单列表（用于按角色缓存）
     */
    List<SysMenu> selectMenusByRoleId(Long roleId);

    /**
     * 根据角色ID查询权限标识
     */
    List<String> selectMenuPermsByRoleId(Long roleId);
}
