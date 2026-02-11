package cn.joywon.poco.merchant.MarketingModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryCreateDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryQueryDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryTargetAudience;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryUpdateDTO;
import cn.joywon.poco.merchant.MarketingModule.entity.PointsMallCategory;
import cn.joywon.poco.merchant.MarketingModule.mapper.PointsMallCategoryMapper;
import cn.joywon.poco.merchant.MarketingModule.repository.IPointsMallCategoryCacheRepository;
import cn.joywon.poco.merchant.MarketingModule.service.IPointsMallCategoryService;
import cn.joywon.poco.merchant.MarketingModule.vo.PointsMallCategoryTreeVO;
import cn.joywon.poco.merchant.MarketingModule.vo.PointsMallCategoryVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointsMallCategoryServiceImpl extends
        ServiceImpl<PointsMallCategoryMapper, PointsMallCategory> implements IPointsMallCategoryService {

    private final IPointsMallCategoryCacheRepository pointsMallCategoryCacheRepository;
    private final PointsMallCategoryMapper pointsMallCategoryMapper;


    /**
     * 添加积分商城商品分类
     *
     * @param dto 积分商城商品分类添加参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> addCategory(PointsMallCategoryCreateDTO dto) {
        /* step-1 检查分类名称 & 父级分类状态(如有) */
        // 检查分类名称
        PointsMallCategory entity = lambdaQuery()
                .eq(PointsMallCategory::getName, dto.getName()).last("LIMIT 1").one();
        Assert.isNull(entity, () -> new CheckedException("新增分类失败, 分类名称已存在"));
        // 检查父级分类(如有)
        int depth = 1;
        if (dto.getParentId() != null && !ObjUtil.equal("0", dto.getParentId())) {
            PointsMallCategory parentEntity = getById(dto.getParentId());
            Assert.notNull(parentEntity, () -> new CheckedException("新增分类失败, 父级分类不存在"));
            Assert.isTrue(parentEntity.getEnable(), () -> new CheckedException("新增分类失败, 父级分类已禁用"));
            depth = parentEntity.getDepth() + 1;
        }

        /* step-2 初始化实体 */
        entity = new PointsMallCategory();
        BeanUtil.copyProperties(dto, entity);
        entity.setDepth(depth);
        // 设置分类目标用户配置
        if (dto.getTargetAudiences() != null) {
            entity.setTargetAudience(convTargetAudience2Json(dto.getTargetAudiences()));
        }

        /* step-3 写入数据库 */
        boolean result = save(entity);
        Assert.isTrue(result, () -> new CheckedException("新增分类失败, 请重试"));

        /* step-4 写入缓存(仅当分类启用时) */
        if (!entity.getEnable()) {
            return R.ok();
        }
        PointsMallCategoryTreeVO cacheVo = BeanUtil.copyProperties(dto, PointsMallCategoryTreeVO.class);
        cacheVo.setParentId(entity.getParentId());
        cacheVo.setId(entity.getId());
        // 当分类为顶级分类时, 直接写入
        if (entity.getParentId() == null || entity.getParentId().intValue() == 0 && entity.getDepth() == 1) {
            pointsMallCategoryCacheRepository.upsertParentCategoryCache(cacheVo);
            return R.ok();
        }
        // 当分类为子级分类时, 需要重新构建当前顶级分类下的子级分类树形列表再写入
        Long topParentId = pointsMallCategoryMapper.findTopParentCategory(entity.getId());
        List<PointsMallCategoryTreeVO> vos = queryEnableSubCategoryTreeList(topParentId, true);
        pointsMallCategoryCacheRepository.upsertSubTreeCategoryCache(topParentId, vos);

        return R.ok();
    }


    /**
     * 删除积分商城商品分类
     *
     * @param id 商品分类ID
     * @return 操作结果
     */
    @Override
    public R<?> deleteCategory(String id) {
        /* step-1 检查分类状态 */
        PointsMallCategory entity = getById(id);
        Assert.notNull(entity, () -> new CheckedException("删除分类失败, 分类不存在"));
        // 检查是否存在子级分类
        Long subCount = lambdaQuery().eq(PointsMallCategory::getParentId, entity.getId()).count();
        Assert.isTrue(subCount.intValue() == 0, () -> new CheckedException("删除分类失败, 该分类下有正在启用的子级分类"));

        /* step-2 更新数据库 */
        entity.setDeletedTime(LocalDateTime.now());
        entity.setEnable(false);
        entity.setDeleted(true);
        boolean result = updateById(entity);
        Assert.isTrue(result, () -> new RuntimeException("删除分类失败, 请重试"));

        /* step-3 更新缓存 */
        // 当分类为顶级分类时, 直接删除
        if (entity.getDepth() == 1) {
            pointsMallCategoryCacheRepository.dropParentCategoryCache(entity.getId());
            return R.ok();
        }
        // 当分类为子级分类时, 需要重新构建当前顶级分类下的子级分类树形列表再删除
        Long topParentId = pointsMallCategoryMapper.findTopParentCategory(entity.getId());
        List<PointsMallCategoryTreeVO> vos = queryEnableSubCategoryTreeList(topParentId, false);
        pointsMallCategoryCacheRepository.upsertSubTreeCategoryCache(topParentId, vos);

        return R.ok();
    }


    /**
     * 更新积分商城商品分类
     *
     * @param dto 积分商城商品分类更新参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> updateCategory(PointsMallCategoryUpdateDTO dto) {
        /* step-1 检查分类状态 */
        // 检查分类是否存在
        PointsMallCategory entity = getById(dto.getId());
        Assert.notNull(entity, () -> new CheckedException("更新分类失败, 分类不存在"));
        // 检查名称是否冲突
        if (StrUtil.isNotBlank(dto.getName())) {
            PointsMallCategory existName = lambdaQuery()
                    .eq(PointsMallCategory::getName, dto.getName()).last("LIMIT 1").one();
            if (existName != null) {
                Assert.isTrue(ObjUtil.equal(entity.getId(), existName.getId()),
                        () -> new CheckedException("更新分类失败, 分类名称已存在"));
            }
        }
        // 检查父级分类(如有)
        int depth = entity.getDepth();
        if (StrUtil.isNotBlank(dto.getParentId()) && !ObjUtil.equal("0", dto.getParentId())) {
            PointsMallCategory parentEntity = getById(dto.getParentId());
            Assert.notNull(parentEntity, () -> new CheckedException("更新分类失败, 父级分类不存在"));
            Assert.isTrue(parentEntity.getEnable(), () -> new CheckedException("更新分类失败, 父级分类已禁用"));
            depth = parentEntity.getDepth() + 1;
        }

        /* step-2 更新数据库 */
        CopyOptions copier = CopyOptions.create().ignoreNullValue();
        BeanUtil.copyProperties(dto, entity, copier);
        entity.setDepth(depth);
        if (dto.getTargetAudiences() != null) {
            entity.setTargetAudience(convTargetAudience2Json(dto.getTargetAudiences()));
        }
        boolean result = updateById(entity);
        Assert.isTrue(result, () -> new RuntimeException("更新分类失败, 请重试"));

        /* step-3 更新缓存 */
        if (depth == 1) {
            // 当前为父级分类时
            if (dto.getEnable()) {
                // 状态启用更新
                PointsMallCategoryTreeVO cacheVo = BeanUtil.copyProperties(entity, PointsMallCategoryTreeVO.class);
                if (StrUtil.isNotEmpty(entity.getTargetAudience())) {
                    cacheVo.setTargetAudiences(convTargetAudience2Bean(entity.getTargetAudience()));
                }
                pointsMallCategoryCacheRepository.upsertParentCategoryCache(cacheVo);
            } else {
                // 状态禁用更新
                pointsMallCategoryCacheRepository.dropParentCategoryCache(entity.getId());
            }
        } else {
            // 当前为子级分类时
            upsertTreeCategoryCache(entity.getId(), false);
        }

        return R.ok();
    }


    /**
     * 启用/禁用积分商城商品分类
     *
     * @param id     商品分类ID
     * @param enable 启用/禁用
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> enableCategory(String id, Boolean enable) {
        /* step-1 检查分类状态 */
        // 检查分类是否存在
        PointsMallCategory entity = getById(id);
        Assert.notNull(entity, () -> new CheckedException(enable ? "启用" : "禁用" + "分类失败, 分类不存在"));
        boolean isParent = entity.getDepth() == 1;
        Long categoryId = entity.getId();
        // 检查父级分类是否在禁用状态(如有)
        if (!isParent) {
            PointsMallCategory parentEntity = getById(entity.getParentId());
            Assert.notNull(parentEntity, () -> {
                log.error("启用/禁用分类失败, 父级分类不存在, 分类ID: {}", categoryId);
                return new CheckedException("启用/禁用分类失败, 父级分类不存在");
            });
            Assert.isTrue(parentEntity.getEnable(), () -> new CheckedException("启用/禁用分类失败, 父级分类已禁用"));
        }
        // 检查分类当前状态
        Assert.isTrue(entity.getEnable() != enable,
                () -> new CheckedException("分类当前已是" + (enable ? "启用" : "禁用") + "状态"));

        /* step-2 更新数据库分类状态 */
        boolean result;
        if (enable) {
            // 当启用分类时, 仅启用本级分类
            entity.setEnable(true);
            result = updateById(entity);
            Assert.isTrue(result, () -> new RuntimeException("启用分类失败, 请重试"));
        } else {
            // 当禁用分类时, 联级禁用分类下子级分类
            List<PointsMallCategory> categories = pointsMallCategoryMapper.querySubCategoryIds(categoryId);
            Assert.notEmpty(categories, () -> new CheckedException("禁用分类失败, 未找到分类及其子分类"));
            categories.forEach(i -> i.setEnable(false));
            result = updateBatchById(categories);
            Assert.isTrue(result, () -> new RuntimeException("禁用分类失败, 请重试"));
        }

        /* step-3 更新缓存 */
        if (enable) {
            // 当启用状态时, 更新缓存
            if (isParent) {
                // 当前分类为顶级父分类时
                PointsMallCategoryTreeVO cacheVo = BeanUtil.copyProperties(entity, PointsMallCategoryTreeVO.class);
                if (StrUtil.isNotBlank(entity.getTargetAudience())) {
                    cacheVo.setTargetAudiences(convTargetAudience2Bean(entity.getTargetAudience()));
                }
                pointsMallCategoryCacheRepository.upsertParentCategoryCache(cacheVo);
            } else {
                // 当前分类为子级树分类时
                upsertTreeCategoryCache(categoryId, true);
            }
        } else {
            // 当禁用状态时, 删除/更新缓存
            if (isParent) {
                // 当前分类为顶级父分类时
                pointsMallCategoryCacheRepository.dropParentCategoryCache(categoryId);
                pointsMallCategoryCacheRepository.dropTreeCategoryCache(categoryId);
            } else {
                // 当前分类为子级树分类时
                upsertTreeCategoryCache(categoryId, false);
            }
        }

        return R.ok();
    }


    /**
     * 查询积分商城商品分类父级列表
     *
     * @return 查询结果(父级分类列表)
     */
    @Override
    public List<PointsMallCategoryTreeVO> queryParentCategoryList() {
        List<PointsMallCategoryTreeVO> vos = new ArrayList<>();

        List<PointsMallCategory> categories = lambdaQuery()
                .eq(PointsMallCategory::getEnable, true)
                .eq(PointsMallCategory::getParentId, 0L)
                .orderByDesc(PointsMallCategory::getRecommend)
                .orderByAsc(PointsMallCategory::getSortOrder)
                .list();
        if (CollUtil.isEmpty(categories)) {
            return vos;
        }

        for (PointsMallCategory entity : categories) {
            PointsMallCategoryTreeVO vo = BeanUtil.copyProperties(entity, PointsMallCategoryTreeVO.class);
            if (StrUtil.isNotBlank(entity.getTargetAudience())) {
                vo.setTargetAudiences(convTargetAudience2Bean(entity.getTargetAudience()));
            }
            vos.add(vo);
        }

        return vos;
    }


    /**
     * 查询积分商城商品分类下树形结构子级分类
     *
     * @param topParentId 商品分类ID
     * @param enable      是否仅查询启用分类
     * @return 查询结果(分类下树形结构子级分类)
     */
    @Override
    public PointsMallCategoryTreeVO queryCategorySubTreeList(Long topParentId, Boolean enable) {
        /* step-1 检查当前分类状态 */
        PointsMallCategory category = getById(topParentId);
        Assert.notNull(category, () -> new CheckedException("分类不存在"));
        if (enable != null && enable.equals(Boolean.TRUE)) {
            Assert.isTrue(category.getEnable(), () -> new CheckedException("分类不存在"));
        }

        /* step-2 获取当前分类下所有子级分类 */
        PointsMallCategoryTreeVO vo = BeanUtil.copyProperties(category, PointsMallCategoryTreeVO.class);
        List<PointsMallCategory> categories = pointsMallCategoryMapper.querySubCategoryList(topParentId, enable);
        if (CollUtil.isEmpty(categories)) {
            return vo;
        }

        /* step-3 构建分类树形结构 */
        List<PointsMallCategoryTreeVO> vos = buildCategoryVoTree(topParentId, categories);
        vo.setChildren(vos);

        return vo;
    }


    /**
     * 查询积分商城商品分类列表
     *
     * @param dto 查询参数
     * @return 查询结果(分页分类列表)
     */
    @Override
    public R<PageQueryVO<PointsMallCategoryVO>> queryCategoryList(PointsMallCategoryQueryDTO dto) {
        IPage<PointsMallCategory> pageData;
        // 指定查询父类, 最高优先级
        if (StrUtil.isNotBlank(dto.getParentName())) {
            pageData = pointsMallCategoryMapper.querySubCategoryByName(dto.page(), dto);
            List<PointsMallCategory> categories = pageData.getRecords();
            if (CollUtil.isEmpty(categories)) {
                return R.ok(PageQueryVO.empty(pageData));
            }

            return R.ok(PageQueryVO.of(pageData, this::convCategoryVO));
        }

        // 未指定查询父类, 查询所有分类
        pageData = pointsMallCategoryMapper.queryCategoryList(dto.page(), dto);
        if (CollUtil.isEmpty(pageData.getRecords())) {
            return R.ok(PageQueryVO.empty(pageData));
        }

        return R.ok(PageQueryVO.of(pageData, this::convCategoryVO));
    }


    /* ================================================== 消费者端 ============================================================ */


    /**
     * 查询积分商城商品分类父级列表缓存
     *
     * @return 查询结果(父级分类列表缓存)
     */
    @Override
    public R<List<PointsMallCategoryTreeVO>> getParentCategory() {
        // 查询缓存数据
        List<PointsMallCategoryTreeVO> cacheVos = pointsMallCategoryCacheRepository.getParentCategoryCache();
        if (CollUtil.isNotEmpty(cacheVos)) {
            return R.ok(cacheVos);
        }
        // 缓存没有数据, 查询数据库
        List<PointsMallCategoryTreeVO> dbVos = queryParentCategoryList();
        if (CollUtil.isEmpty(dbVos)) {
            log.error("获取积分商城商品分类父级列表失败, 数据库无分类数据");
            return R.ok(List.of());
        }
        // 从数据库查询的数据写入缓存
        pointsMallCategoryCacheRepository.upsertParentCategoryCache(dbVos);

        return R.ok(dbVos, "please check the cache");
    }


    /**
     * 获取积分商城商品分类子级树形列表
     *
     * @param topParentId 顶级父级分类ID
     * @return 查询结果(分类子级树形列表)
     */
    @Override
    public R<List<PointsMallCategoryTreeVO>> getSubTreeCategory(String topParentId) {
        // 查询缓存数据
        List<PointsMallCategoryTreeVO> cacheVos = pointsMallCategoryCacheRepository.getSubTreeCategoryCache(topParentId);
        if (CollUtil.isNotEmpty(cacheVos)) {
            return R.ok(cacheVos);
        }
        // 缓存没有数据, 查询数据库
        PointsMallCategoryTreeVO dbVo = queryCategorySubTreeList(Long.valueOf(topParentId), true);
        List<PointsMallCategoryTreeVO> dbVos = dbVo.getChildren();
        if (CollUtil.isEmpty(dbVos)) {
            log.error("获取积分商城商品分类子级树形列表失败, 数据库无分类数据, 顶级父级ID: {}", topParentId);
            return R.ok(List.of());
        }
        // 从数据库查询的数据写入缓存
        pointsMallCategoryCacheRepository.upsertSubTreeCategoryCache(topParentId, dbVos);

        return R.ok(dbVos, "please check the cache");
    }


    /* private ======================================== 私有方法 ================================================== private */


    /**
     * private
     * 添加/修改积分商城商品分类缓存
     *
     * @param currentCategoryId 当前分类ID
     * @param notEmpty          是否允许查询到的子分类为空
     */
    private void upsertTreeCategoryCache(Long currentCategoryId, boolean notEmpty) {
        Long topParentId = pointsMallCategoryMapper.findTopParentCategory(currentCategoryId);
        List<PointsMallCategoryTreeVO> cacheVos = queryEnableSubCategoryTreeList(topParentId, notEmpty);
        pointsMallCategoryCacheRepository.upsertSubTreeCategoryCache(topParentId, cacheVos);
    }


    /**
     * private
     * 获取顶级分类下所有子级分类树形列表
     *
     * @param topParentId 顶级分类ID
     * @param notEmpty    是否断言数据不为空
     * @return 顶级分类下所有子级分类树形列表
     */
    private List<PointsMallCategoryTreeVO> queryEnableSubCategoryTreeList(Long topParentId, boolean notEmpty) {
        List<PointsMallCategory> categories = pointsMallCategoryMapper.querySubCategoryList(topParentId, true);
        if (notEmpty) {
            Assert.notEmpty(categories, () -> {
                log.error("根据积分商城商品分类顶级父类ID查询子级分类没有获取到数据, 父级分类ID: {}", topParentId);
                throw new RuntimeException("新增分类失败, 请重试");
            });
        }

        if (CollUtil.isEmpty(categories)) {
            return null;
        }
        return buildCategoryVoTree(topParentId, categories);
    }


    /**
     * private
     * 转换商品分类目标用户配置Bean为JSON字符串
     *
     * @param dto 目标用户配置Bean
     * @return 目标用户配置JSON
     */
    private String convTargetAudience2Json(PointsMallCategoryTargetAudience dto) {
        PointsMallCategory.TargetAudience targetAudience = new PointsMallCategory.TargetAudience();
        targetAudience.setMin_level(dto.getMinLevel());
        targetAudience.setMax_level(dto.getMaxLevel());
        if (CollUtil.isNotEmpty(dto.getUserTypes())) {
            targetAudience.setUser_type(JSONUtil.toJsonStr(dto.getUserTypes()));
        }

        return JSONUtil.toJsonStr(targetAudience);
    }


    /**
     * private
     * 转换商品分类目标用户配置JSON为Bean
     *
     * @param json 商品分类目标用户配置JSON
     * @return 商品分类目标用户配置Bean
     */
    private PointsMallCategoryTargetAudience convTargetAudience2Bean(String json) {
        PointsMallCategory.TargetAudience entity = JSONUtil.toBean(json, PointsMallCategory.TargetAudience.class);
        PointsMallCategoryTargetAudience dto = new PointsMallCategoryTargetAudience();
        dto.setMinLevel(entity.getMin_level());
        dto.setMaxLevel(entity.getMax_level());
        if (StrUtil.isNotBlank(entity.getUser_type())) {
            dto.setUserTypes(JSONUtil.toList(entity.getUser_type(), String.class));
        }

        return dto;
    }


    /**
     * private
     * 转换商品分类实体为VO
     *
     * @param entity 商品分类实体
     * @return 商品分类VO
     */
    private PointsMallCategoryVO convCategoryVO(PointsMallCategory entity) {
        PointsMallCategoryVO vo = BeanUtil.copyProperties(entity, PointsMallCategoryVO.class);
        if (StrUtil.isNotBlank(entity.getTargetAudience())) {
            vo.setTargetAudiences(convTargetAudience2Bean(entity.getTargetAudience()));
        }

        return vo;
    }


    /**
     * private
     * 构建商品分类树形结构
     *
     * @param topParentId 顶级父级分类ID
     * @param categories  商品分类列表
     * @return 商品分类树形结构
     */
    private List<PointsMallCategoryTreeVO> buildCategoryVoTree(Long topParentId, List<PointsMallCategory> categories) {
        // 初始化分类map
        Map<Long, PointsMallCategoryTreeVO> voMap = new HashMap<>();
        for (PointsMallCategory entity : categories) {
            PointsMallCategoryTreeVO vo = BeanUtil.copyProperties(entity, PointsMallCategoryTreeVO.class);
            if (StrUtil.isNotBlank(entity.getTargetAudience())) {
                vo.setTargetAudiences(convTargetAudience2Bean(entity.getTargetAudience()));
            }
            voMap.put(vo.getId(), vo);
        }
        // 构建树形结构
        List<PointsMallCategoryTreeVO> vos = new ArrayList<>();
        for (PointsMallCategoryTreeVO vo : voMap.values()) {
            Long parentId = vo.getParentId();
            if (parentId != null && ObjUtil.equal(parentId, topParentId)) {
                vos.add(vo);
            } else if (parentId != null && voMap.containsKey(parentId)) {
                PointsMallCategoryTreeVO parentVo = voMap.get(parentId);
                if (CollUtil.isEmpty(parentVo.getChildren())) {
                    parentVo.setChildren(List.of());
                }
                parentVo.getChildren().add(vo);
            }
        }

        return vos;
    }

}