package cn.joywon.poco.merchant.PlatformModule.mapper;

import cn.joywon.poco.merchant.PlatformModule.dto.BannerQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.MiniBanner;
import cn.joywon.poco.merchant.PlatformModule.vo.BannerListVO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MiniBannerMapper extends BaseMapper<MiniBanner> {


    /**
     * 删除轮播图
     *
     * @param id 轮播图id
     * @return 受影响行数
     */
    int deleteBanner(@Param("id") String id);


    /**
     * 查询轮播图分页列表
     *
     * @param page 分页参数
     * @param dto  轮播图查询参数
     * @return 轮播图列表
     */
    Page<BannerListVO> queryBanner(@Param("page") Page<BannerListVO> page,
                                   @Param("dto") BannerQueryDTO dto);


}