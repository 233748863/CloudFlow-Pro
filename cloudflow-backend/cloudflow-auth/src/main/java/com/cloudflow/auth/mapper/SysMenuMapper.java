package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysMenu;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface SysMenuMapper extends BaseMapper<SysMenu> {
    
    /**
     * 根据用户ID查询菜单
     */
    List<String> selectMenuPermsByUserId(Long userId);

    List<SysMenu> selectMenuTreeByUserId(Long userId);
}
