package cn.joywon.poco.admin.service;

import cn.hutool.core.lang.tree.Tree;
import cn.joywon.poco.admin.api.entity.SysAreaEntity;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface SysAreaService extends IService<SysAreaEntity> {

    /**
     * 查询行政区划树
     *
     * @param sysArea 查询条件
     * @return 树
     */
    List<Tree<Long>> selectTree(SysAreaEntity sysArea);

    /**
     * 分页查询
     *
     * @param page    分页对象
     * @param sysArea 行政区划
     * @return Page
     */
    Page selectPage(Page page, SysAreaEntity sysArea);


    /**
     * 根据adCode查询地区名称
     *
     * @param adCode adCode
     * @return 地区名称
     */
    String getLocationByCode(Long adCode);


    /**
     * 根据城市名称查询adCode
     *
     * @param name 地区名称
     * @return adCode
     */
    Long getCodeByLocation(String name);


    /**
     * 根据adCode列表获取地区名称列表
     *
     * @param adCodes adCode列表
     * @return 地区名称列表
     */
    List<String> getLocationsByCodes(List<Long> adCodes);


}