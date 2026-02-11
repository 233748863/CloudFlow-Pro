package cn.joywon.poco.merchant.PlatformModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerCreateDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.MiniBanner;
import cn.joywon.poco.merchant.PlatformModule.vo.BannerDetailVO;
import cn.joywon.poco.merchant.PlatformModule.vo.BannerListVO;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniBannerVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface IMiniBannerService extends IService<MiniBanner> {


    /**
     * 新增轮播图
     *
     * @param dto 轮播图新增参数
     * @return 操作结果(轮播图详情)
     */
    R<BannerDetailVO> saveBanner(BannerCreateDTO dto);


    /**
     * 删除轮播图
     *
     * @param id 轮播图ID
     * @return 操作结果
     */
    R<?> deleteBanner(String id);


    /**
     * 激活延迟生效轮播图
     *
     * @param id 轮播图ID
     */
    void activateBanner(String id);


    /**
     * 重建轮播图缓存
     *
     * @return 操作结果
     */
    R<?> rebuildBannerCache();


    /**
     * 修改轮播图信息
     *
     * @param dto 轮播图修改参数
     * @return 操作结果(轮播图详情)
     */
    R<BannerDetailVO> modifyBanner(BannerUpdateDTO dto);


    /**
     * 启用/禁用轮播图
     *
     * @param id 轮播图ID
     * @return 操作结果
     */
    R<?> enableBanner(String id);


    /**
     * 轮播图过期处理
     *
     * @param bannerId 轮播图ID
     */
    void expireBanner(String bannerId);


    /**
     * 查询轮播图分页列表
     *
     * @param dto 轮播图查询参数
     * @return 查询结果(轮播图列表)
     */
    R<PageQueryVO<BannerListVO>> queryBanner(BannerQueryDTO dto);


    /**
     * 查询轮播图详情
     *
     * @param id 轮播图ID
     * @return 查询结果(轮播图详情)
     */
    R<BannerDetailVO> bannerDetail(String id);


    /**
     * 【小程序端】
     * 获取首页轮播图
     *
     * @return 响应结果(首页轮播图列表)
     */
    R<List<MiniBannerVO>> getIndexBanner();


}