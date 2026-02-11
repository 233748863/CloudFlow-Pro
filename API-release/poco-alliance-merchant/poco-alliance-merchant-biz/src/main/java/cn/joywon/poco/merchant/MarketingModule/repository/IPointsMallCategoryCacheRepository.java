package cn.joywon.poco.merchant.MarketingModule.repository;

import cn.joywon.poco.merchant.MarketingModule.vo.PointsMallCategoryTreeVO;

import java.io.Serializable;
import java.util.List;

public interface IPointsMallCategoryCacheRepository {


    /**
     * 添加/修改 父级别分类缓存
     *
     * @param cacheVo 父级分类
     */
    void upsertParentCategoryCache(PointsMallCategoryTreeVO cacheVo);


    /**
     * 添加/修改 父级别分类缓存
     *
     * @param cacheVos 父级分类列表
     */
    void upsertParentCategoryCache(List<PointsMallCategoryTreeVO> cacheVos);


    /**
     * 添加/修改 父级分类下树形子级分类缓存
     *
     * @param topParentId 顶级父级分类ID
     * @param cacheVos    分类树形结构
     */
    void upsertSubTreeCategoryCache(Serializable topParentId, List<PointsMallCategoryTreeVO> cacheVos);


    /**
     * 删除父级分类缓存
     *
     * @param id 分类ID
     */
    void dropParentCategoryCache(Serializable id);


    /**
     * 删除父级分类下树形子级分类缓存
     *
     * @param topParentId 顶级父级分类ID
     */
    void dropTreeCategoryCache(Serializable topParentId);


    /**
     * 获取父级分类缓存
     *
     * @return 父级分类缓存
     */
    List<PointsMallCategoryTreeVO> getParentCategoryCache();


    /**
     * 获取父级分类下树形子级分类缓存
     *
     * @param topParentId 顶级父级分类ID
     * @return 父级分类下树形子级分类缓存
     */
    List<PointsMallCategoryTreeVO> getSubTreeCategoryCache(Serializable topParentId);


}