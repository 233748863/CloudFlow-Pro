package cn.joywon.poco.merchant.MarketingModule.repository.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallCacheKey;
import cn.joywon.poco.merchant.MarketingModule.repository.IPointsMallCategoryCacheRepository;
import cn.joywon.poco.merchant.MarketingModule.vo.PointsMallCategoryTreeVO;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.io.Serializable;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;


@Repository
@RequiredArgsConstructor
public class PointsMallCategoryCacheRepositoryImpl implements IPointsMallCategoryCacheRepository, PointsMallCacheKey {

    private final RedisTemplate<String, Object> redisTemplate;


    /**
     * 添加/修改 父级别分类缓存
     *
     * @param cacheVo 父级分类
     */
    @Override
    public void upsertParentCategoryCache(PointsMallCategoryTreeVO cacheVo) {
        redisTemplate.opsForHash().put(CATEGORY_PARENT_CACHE_KEY, cacheVo.getId().toString(), JSONUtil.toJsonStr(cacheVo));
    }


    /**
     * 添加/修改 父级别分类缓存
     *
     * @param cacheVos 父级分类列表
     */
    @Override
    public void upsertParentCategoryCache(List<PointsMallCategoryTreeVO> cacheVos) {
        Map<Long, String> voMap = cacheVos.stream()
                .collect(Collectors.toMap(PointsMallCategoryTreeVO::getId, JSONUtil::toJsonStr));
        redisTemplate.opsForHash().putAll(CATEGORY_PARENT_CACHE_KEY, voMap);
    }


    /**
     * 添加/修改 父级分类下树形子级分类缓存
     *
     * @param topParentId 顶级父级分类ID
     * @param cacheVos    分类树形结构
     */
    @Override
    public void upsertSubTreeCategoryCache(Serializable topParentId, List<PointsMallCategoryTreeVO> cacheVos) {
        dropTreeCategoryCache(topParentId);
        if (CollUtil.isEmpty(cacheVos)) {
            return;
        }
        redisTemplate.opsForHash().put(CATEGORY_TREE_CACHE_KEY, topParentId.toString(), JSONUtil.toJsonStr(cacheVos));
    }


    /**
     * 删除父级分类缓存
     *
     * @param id 分类ID
     */
    @Override
    public void dropParentCategoryCache(Serializable id) {
        redisTemplate.opsForHash().delete(CATEGORY_PARENT_CACHE_KEY, id.toString());
    }


    /**
     * 删除父级分类下树形子级分类缓存
     *
     * @param topParentId 顶级父级分类ID
     */
    @Override
    public void dropTreeCategoryCache(Serializable topParentId) {
        redisTemplate.opsForHash().delete(CATEGORY_TREE_CACHE_KEY, topParentId.toString());
    }


    /**
     * 获取父级分类缓存
     *
     * @return 父级分类缓存
     */
    @Override
    public List<PointsMallCategoryTreeVO> getParentCategoryCache() {
        Map<Object, Object> cacheData = redisTemplate.opsForHash().entries(CATEGORY_PARENT_CACHE_KEY);
        if (CollUtil.isEmpty(cacheData)) {
            return null;
        }
        List<String> jsonList = cacheData.values().stream().map(Object::toString).toList();
        return jsonList.stream().map(i -> JSONUtil.toBean(i, PointsMallCategoryTreeVO.class)).toList();
    }


    /**
     * 获取父级分类下树形子级分类缓存
     *
     * @param topParentId 顶级父级分类ID
     * @return 父级分类下树形子级分类缓存
     */
    @Override
    public List<PointsMallCategoryTreeVO> getSubTreeCategoryCache(Serializable topParentId) {
        Object cacheData = redisTemplate.opsForHash().get(CATEGORY_TREE_CACHE_KEY, topParentId.toString());
        if (ObjUtil.isNull(cacheData)) {
            return null;
        }
        List<String> jsonList = JSONUtil.toList(cacheData.toString(), String.class);
        return jsonList.stream().map(i -> JSONUtil.toBean(i, PointsMallCategoryTreeVO.class)).toList();
    }


}