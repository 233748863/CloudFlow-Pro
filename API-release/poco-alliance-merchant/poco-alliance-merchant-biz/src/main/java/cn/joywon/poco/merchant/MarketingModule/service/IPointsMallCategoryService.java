package cn.joywon.poco.merchant.MarketingModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryCreateDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryQueryDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryUpdateDTO;
import cn.joywon.poco.merchant.MarketingModule.entity.PointsMallCategory;
import cn.joywon.poco.merchant.MarketingModule.vo.PointsMallCategoryTreeVO;
import cn.joywon.poco.merchant.MarketingModule.vo.PointsMallCategoryVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface IPointsMallCategoryService extends IService<PointsMallCategory> {


    /**
     * 添加积分商城商品分类
     *
     * @param dto 积分商城商品分类添加参数
     * @return 操作结果
     */
    R<?> addCategory(PointsMallCategoryCreateDTO dto);


    /**
     * 删除积分商城商品分类
     *
     * @param id 商品分类ID
     * @return 操作结果
     */
    R<?> deleteCategory(String id);


    /**
     * 更新积分商城商品分类
     *
     * @param dto 积分商城商品分类更新参数
     * @return 操作结果
     */
    R<?> updateCategory(PointsMallCategoryUpdateDTO dto);


    /**
     * 启用/禁用积分商城商品分类
     *
     * @param id     商品分类ID
     * @param enable 启用/禁用
     * @return 操作结果
     */
    R<?> enableCategory(String id, Boolean enable);


    /**
     * 查询积分商城商品分类父级列表
     *
     * @return 查询结果(父级分类列表)
     */
    List<PointsMallCategoryTreeVO> queryParentCategoryList();


    /**
     * 查询积分商城商品分类下树形结构子级分类
     *
     * @param id     商品分类ID
     * @param enable 是否仅查询启用分类
     * @return 查询结果(分类下树形结构子级分类)
     */
    PointsMallCategoryTreeVO queryCategorySubTreeList(Long id, Boolean enable);


    /**
     * 查询积分商城商品分类列表
     *
     * @param dto 查询参数
     * @return 查询结果(分页分类列表)
     */
    R<PageQueryVO<PointsMallCategoryVO>> queryCategoryList(PointsMallCategoryQueryDTO dto);


    /* ================================================== 消费者端 ============================================================ */


    /**
     * 查询积分商城商品分类父级列表
     *
     * @return 查询结果(父级分类列表)
     */
    R<List<PointsMallCategoryTreeVO>> getParentCategory();


    /**
     * 获取积分商城商品分类子级树形列表
     *
     * @param topParentId 顶级父级分类ID
     * @return 查询结果(分类子级树形列表)
     */
    R<List<PointsMallCategoryTreeVO>> getSubTreeCategory(String topParentId);


}