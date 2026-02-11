package cn.joywon.poco.merchant.MarketingModule.mapper;

import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryQueryDTO;
import cn.joywon.poco.merchant.MarketingModule.entity.PointsMallCategory;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface PointsMallCategoryMapper extends BaseMapper<PointsMallCategory> {


    /**
     * 查询分类及分类下所有子级分类ID列表
     *
     * @param id 分类ID
     * @return 分类ID列表
     */
    List<PointsMallCategory> querySubCategoryIds(@Param("id") Long id);


    /**
     * 查询分类及分类下所有子级分类列表
     *
     * @param id     分类ID
     * @param enable 是否仅查询启用分类
     * @return 分类列表
     */
    List<PointsMallCategory> querySubCategoryList(@Param("id") Long id, @Param("enable") Boolean enable);


    /**
     * 根据父级分类名查询分类列表
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 分类列表
     */
    IPage<PointsMallCategory> querySubCategoryByName(@Param("page") Page<PointsMallCategory> page,
                                                     @Param("dto") PointsMallCategoryQueryDTO dto);


    /**
     * 查询分类列表
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 分类列表
     */
    IPage<PointsMallCategory> queryCategoryList(@Param("page") Page<PointsMallCategory> page,
                                                @Param("dto") PointsMallCategoryQueryDTO dto);


    /**
     * 查询分类的顶级父级分类ID
     *
     * @param id 分类ID
     * @return 顶级父级分类ID
     */
    Long findTopParentCategory(@Param("id") Long id);


}