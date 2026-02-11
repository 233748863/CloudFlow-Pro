package cn.joywon.poco.merchant.ProductModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.constant.CommonConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryCreateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryQueryDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryUpdateDTO;
import cn.joywon.poco.merchant.ProductModule.entity.ProductCategory;
import cn.joywon.poco.merchant.ProductModule.mapper.ProductCategoryMapper;
import cn.joywon.poco.merchant.ProductModule.service.ProductCategoryService;
import cn.joywon.poco.merchant.ProductModule.vo.MiniCategoryMenuVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductCategoryOptsVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductCategoryVO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductCategoryServiceImpl extends ServiceImpl<ProductCategoryMapper, ProductCategory> implements ProductCategoryService {

    private final ProductCategoryMapper categoryMapper;
    private final ProductCategoryMapper productCategoryMapper;

    /**
     * 创建商品分类
     *
     * @param createDTO 创建参数
     * @return 新分类ID
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Long> createCategory(ProductCategoryCreateDTO createDTO) {
        if (createDTO == null || StrUtil.isBlank(createDTO.getName())) {
            return R.failed("分类名称不能为空");
        }
        long dup = this.count(Wrappers.<ProductCategory>lambdaQuery()
                .eq(ProductCategory::getName, createDTO.getName())
                .eq(ProductCategory::getParentId, createDTO.getParentId())
                .eq(ProductCategory::getIsDeleted, CommonConstants.STATUS_NORMAL));
        if (dup > 0) {
            return R.failed("同级分类名称已存在");
        }
        ProductCategory category = new ProductCategory();
        category.setParentId(createDTO.getParentId());
        category.setName(createDTO.getName());
        category.setSortOrder(createDTO.getSortOrder());
        category.setIsDeleted(CommonConstants.STATUS_NORMAL);
        boolean saved = this.save(category);
        if (!saved) {
            return R.failed("分类创建失败");
        }
        return R.ok(category.getId(), "分类创建成功");
    }

    /**
     * 更新商品分类
     *
     * @param updateDTO 更新参数
     * @return 是否成功
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> updateCategory(ProductCategoryUpdateDTO updateDTO) {
        if (updateDTO == null || updateDTO.getId() == null) {
            return R.failed("分类ID不能为空");
        }
        ProductCategory exist = this.getById(updateDTO.getId());
        if (exist == null) {
            return R.failed("分类不存在");
        }
        if (StrUtil.isNotBlank(updateDTO.getName())) {
            long dup = this.count(Wrappers.<ProductCategory>lambdaQuery()
                    .eq(ProductCategory::getName, updateDTO.getName())
                    .eq(ProductCategory::getParentId, updateDTO.getParentId() == null ? exist.getParentId() : updateDTO.getParentId())
                    .ne(ProductCategory::getId, updateDTO.getId())
                    .eq(ProductCategory::getIsDeleted, CommonConstants.STATUS_NORMAL));
            if (dup > 0) {
                return R.failed("同级分类名称已存在");
            }
        }
        ProductCategory toUpdate = new ProductCategory();
        toUpdate.setId(updateDTO.getId());
        toUpdate.setParentId(updateDTO.getParentId());
        toUpdate.setName(updateDTO.getName());
        toUpdate.setSortOrder(updateDTO.getSortOrder());
        boolean ok = this.updateById(toUpdate);
        return ok ? R.ok(true, "分类更新成功") : R.failed("分类更新失败");
    }


    /**
     * 删除商品分类（软删除）
     *
     * @param categoryId 分类ID
     * @return 是否成功
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> deleteCategory(Long categoryId) {
        if (categoryId == null) {
            return R.failed("分类ID不能为空");
        }
        ProductCategory category = this.getById(categoryId);
        if (category == null) {
            return R.failed("分类不存在");
        }
        category.setIsDeleted(CommonConstants.STATUS_DEL);
        boolean ok = this.removeById(category);
        return ok ? R.ok(true, "分类删除成功") : R.failed("分类删除失败");
    }


    /**
     * 批量删除商品分类（软删除）
     *
     * @param categoryIds 分类ID列表
     * @return 是否成功
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> batchDeleteCategories(List<Long> categoryIds) {
        if (CollUtil.isEmpty(categoryIds)) {
            return R.failed("分类ID列表不能为空");
        }
        List<ProductCategory> list = this.listByIds(categoryIds);
        if (CollUtil.isEmpty(list)) {
            return R.failed("分类不存在");
        }
        list.forEach(c -> c.setIsDeleted(CommonConstants.STATUS_DEL));
        boolean ok = this.updateBatchById(list);
        return ok ? R.ok(true, "批量删除成功") : R.failed("批量删除失败");
    }

    /**
     * 获取商品分类详情
     *
     * @param categoryId 分类ID
     * @return 分类详情VO
     */
    @Override
    public R<ProductCategoryVO> getCategoryDetail(Long categoryId) {
        if (categoryId == null) {
            return R.failed("分类ID不能为空");
        }
        ProductCategoryVO vo = this.baseMapper.getCategoryVoById(categoryId);
        if (vo == null) {
            return R.failed("分类不存在");
        }
        return R.ok(vo);
    }

    /**
     * 分页查询商品分类
     *
     * @param page       分页参数
     * @param queryDTO 查询条件
     * @return 分页数据
     */
    @Override
    public IPage<ProductCategoryVO> getCategoryPage(Page<ProductCategoryVO> page, ProductCategoryQueryDTO queryDTO) {
        return this.baseMapper.getCategoryPage(page, queryDTO);
    }

    /**
     * 根据父ID获取子分类列表
     *
     * @param parentId 父ID
     * @return 子分类列表
     */
    @Override
    public List<ProductCategoryVO> getChildrenByParentId(Long parentId) {
        return this.baseMapper.getChildrenByParentId(parentId);
    }
    
    /**
     * 获取树状结构的分类列表
     *
     * @return 树状分类列表
     */
    @Override
    public List<ProductCategoryVO> getCategoryTree() {
        // 获取所有未删除的分类
        List<ProductCategoryVO> allCategories = this.baseMapper.getAllCategories();
        
        // 构建ID到分类的映射
        Map<Long, ProductCategoryVO> categoryMap = allCategories.stream()
                .collect(Collectors.toMap(ProductCategoryVO::getId, c -> c));
        
        // 构建树形结构
        return allCategories.stream()
                .filter(category -> category.getParentId() == null || category.getParentId() == 0)
                .peek(category -> buildCategoryTree(category, categoryMap))
                .collect(Collectors.toList());
    }

    /**
     * 根据分类ID列表获取分类菜单
     *
     * @param categoryIds 分类ID列表
     * @return 分类菜单列表
     */
    @Override
    public List<MiniCategoryMenuVO> getCategoryMenus(Collection<Long> categoryIds) {
        return productCategoryMapper.getCategoryMenus(categoryIds);
    }

    /**
     * 获取商品分类选项列表
     *
     * @return 分类选项列表
     */
    @Override
    public List<ProductCategoryOptsVO> getCategoryOpts() {
        // 获取所有未删除的分类
        List<ProductCategoryVO> allCategories = this.baseMapper.getAllCategories();

        return allCategories.stream()
                .map(category -> {
                    ProductCategoryOptsVO optsVO = new ProductCategoryOptsVO();
                    optsVO.setId(category.getId());
                    optsVO.setName(category.getName());
                    optsVO.setParentId(category.getParentId());
                    return optsVO;
                })
                .toList();
    }

    /**
     * 递归构建分类树
     *
     * @param parent 父分类
     * @param categoryMap 分类映射
     */
    private void buildCategoryTree(ProductCategoryVO parent, Map<Long, ProductCategoryVO> categoryMap) {
        List<ProductCategoryVO> children = categoryMap.values().stream()
                .filter(category -> category.getParentId() != null && category.getParentId().equals(parent.getId()))
                .collect(Collectors.toList());
        
        parent.setChildren(children);
        
        // 递归构建子分类的子分类
        children.forEach(child -> buildCategoryTree(child, categoryMap));
    }
}