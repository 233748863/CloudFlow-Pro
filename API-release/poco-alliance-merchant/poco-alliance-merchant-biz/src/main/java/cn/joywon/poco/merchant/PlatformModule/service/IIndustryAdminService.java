package cn.joywon.poco.merchant.PlatformModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryCreateDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.Industry;
import cn.joywon.poco.merchant.PlatformModule.vo.IndustryVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;


public interface IIndustryAdminService extends IService<Industry> {


    /**
     * 添加行业分类
     *
     * @param dto 行业分类新增参数
     */
    R<?> addIndustry(IndustryCreateDTO dto);


    /**
     * 删除行业分类
     *
     * @param id 行业分类ID
     */
    R<?> deleteIndustry(Long id);


    /**
     * 修改行业分类
     *
     * @param dto 行业分类修改参数
     */
    R<?> updateIndustry(IndustryUpdateDTO dto);


    /**
     * 获取行业分类列表（分页，支持多条件查询）
     *
     * @param page     分页对象
     * @param queryDTO 查询条件
     * @return 行业分类分页列表
     */
    R<IPage<IndustryVO>> getIndustryList(Page<Industry> page, IndustryQueryDTO queryDTO);


    /**
     * 根据ID获取行业分类
     *
     * @param industryId 行业分类ID
     * @return 行业分类
     */
    R<IndustryVO> getIndustryById(Long industryId);


}