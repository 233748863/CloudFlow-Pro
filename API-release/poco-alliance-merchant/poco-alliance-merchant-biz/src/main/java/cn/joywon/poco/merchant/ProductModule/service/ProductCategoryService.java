package cn.joywon.poco.merchant.ProductModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryCreateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryQueryDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryUpdateDTO;
import cn.joywon.poco.merchant.ProductModule.entity.ProductCategory;
import cn.joywon.poco.merchant.ProductModule.vo.MiniCategoryMenuVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductCategoryOptsVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductCategoryVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.Collection;
import java.util.List;

public interface ProductCategoryService extends IService<ProductCategory> {

    /**
     * 创建商品分类
     * @param createDTO 创建参数（父分类ID、分类名称、排序）
     * @return 新分类ID
     */
    R<Long> createCategory(ProductCategoryCreateDTO createDTO);

    /**
     * 更新商品分类
     * @param updateDTO 更新参数（分类ID、父分类ID、名称、排序）
     * @return 是否成功
     */
    R<Boolean> updateCategory(ProductCategoryUpdateDTO updateDTO);

    /**
     * 删除商品分类（软删除）
     * @param categoryId 分类ID
     * @return 是否成功
     */
    R<Boolean> deleteCategory(Long categoryId);

    /**
     * 批量删除商品分类（软删除）
     * @param categoryIds 分类ID列表
     * @return 是否成功
     */
    R<Boolean> batchDeleteCategories(List<Long> categoryIds);

    /**
     * 获取商品分类详情
     * @param categoryId 分类ID
     * @return 分类详情
     */
    R<ProductCategoryVO> getCategoryDetail(Long categoryId);

    /**
     * 分页查询商品分类
     * @param page 分页参数
     * @param queryDTO 查询条件
     * @return 分页数据
     */
    IPage<ProductCategoryVO> getCategoryPage(Page<ProductCategoryVO> page, ProductCategoryQueryDTO queryDTO);

    /**
     * 根据父ID获取子分类列表
     * @param parentId 父分类ID
     * @return 子分类列表
     */
    List<ProductCategoryVO> getChildrenByParentId(Long parentId);
    
    /**
     * 获取树状结构的分类列表
     * @return 树状分类列表
     */
    List<ProductCategoryVO> getCategoryTree();

    /**
     * 根据分类ID列表获取分类菜单列表
     * 【消费者端】
     *
     * @param categoryIds 分类ID列表
     * @return 分类菜单列表
     */
    List<MiniCategoryMenuVO> getCategoryMenus(Collection<Long> categoryIds);

    /**
     * 获取商品分类选项列表
     * @return 分类选项列表
     */
    List<ProductCategoryOptsVO> getCategoryOpts();
}