package cn.joywon.poco.merchant.ProductModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryQueryDTO;
import cn.joywon.poco.merchant.ProductModule.entity.ProductCategory;
import cn.joywon.poco.merchant.ProductModule.vo.MiniCategoryMenuVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductCategoryVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

@Mapper
public interface ProductCategoryMapper extends PocoBaseMapper<ProductCategory> {

    /**
     * 分页查询商品分类
     * @param page 分页参数
     * @param query 查询条件
     * @return 商品分类分页数据
     */
    IPage<ProductCategoryVO> getCategoryPage(Page page, @Param("query") ProductCategoryQueryDTO query);

    /**
     * 根据ID查询商品分类详情
     * @param categoryId 分类ID
     * @return 分类详情
     */
    ProductCategoryVO getCategoryVoById(@Param("categoryId") Long categoryId);

    /**
     * 根据父ID查询子分类列表
     * @param parentId 父分类ID
     * @return 子分类列表
     */
    List<ProductCategoryVO> getChildrenByParentId(@Param("parentId") Long parentId);
    
    /**
     * 获取所有未删除的商品分类
     * @return 所有商品分类列表
     */
    List<ProductCategoryVO> getAllCategories();


    /**
     * 根据分类ID列表获取分类菜单
     * @param categoryIds 分类ID列表
     * @return 分类菜单列表
     */
    List<MiniCategoryMenuVO> getCategoryMenus(@Param("categoryIds") Collection<Long> categoryIds);
}