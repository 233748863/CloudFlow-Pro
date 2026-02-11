package cn.joywon.poco.merchant.PlatformModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.definition.BannerTypeEnum;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerCacheDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerCreateDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.BannerUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.MiniBanner;
import cn.joywon.poco.merchant.PlatformModule.mapper.MiniBannerMapper;
import cn.joywon.poco.merchant.PlatformModule.repository.IMiniBannerRepository;
import cn.joywon.poco.merchant.PlatformModule.service.IMiniBannerService;
import cn.joywon.poco.merchant.PlatformModule.vo.BannerDetailVO;
import cn.joywon.poco.merchant.PlatformModule.vo.BannerListVO;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniBannerVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.Serializable;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MiniBannerServiceImpl extends ServiceImpl<MiniBannerMapper, MiniBanner> implements IMiniBannerService {

    private final IMiniBannerRepository miniBannerRepository;

    private final MiniBannerMapper miniBannerMapper;


    /**
     * 新增轮播图
     *
     * @param dto 轮播图新增参数
     * @return 操作结果(轮播图详情)
     */
    @Override
    @Transactional(rollbackFor = RuntimeException.class)
    public R<BannerDetailVO> saveBanner(BannerCreateDTO dto) {
        /* step-1 检查名称是否重复 */
        MiniBanner banner = lambdaQuery()
                .eq(MiniBanner::getImageName, dto.getImageName()).last("LIMIT 1").one();
        if (ObjUtil.isNotNull(banner)) {
            return R.failed("图片名称已存在");
        }

        /* step-2 写入数据库 */
        banner = new MiniBanner();
        BeanUtil.copyProperties(dto, banner);
        if (dto.getShowStartTime() == null) {
            banner.setShowStartTime(LocalDate.now().atStartOfDay());
        }
        if (dto.getShowEndTime() == null) {
            banner.setShowEndTime(BannerTypeEnum.BANNER_NEVER_EXPIRE);
        }
        if (dto.getEnable() == null) {
            banner.setEnable(false);
        }
        boolean result = save(banner);
        Assert.isTrue(result, () -> new RuntimeException("新增轮播图失败"));
        if (!banner.getEnable()) {
            return R.ok();
        }

        /* step-3 写入缓存 */
        try {
            writeBannerCache(banner);
        } catch (Exception e) {
            log.error("新增轮播图缓存失败", e);
            throw new RuntimeException("新增轮播图失败");
        }

        BannerDetailVO vo = BeanUtil.copyProperties(banner, BannerDetailVO.class);
        vo.setCreatedTime(LocalDateTime.now());

        return R.ok(vo);
    }


    /**
     * 删除轮播图
     *
     * @param id 轮播图ID
     * @return 操作结果
     */
    @Override
    public R<?> deleteBanner(String id) {
        MiniBanner banner = getById(id);
        Assert.notNull(banner, () -> new RuntimeException("删除失败, 轮播图不存在"));
        int count = miniBannerMapper.deleteBanner(id);
        Assert.isTrue(count == 1, () -> new RuntimeException("删除轮播图失败"));
        miniBannerRepository.dropBannerCache(id);

        return R.ok();
    }


    /**
     * 激活延迟生效轮播图
     *
     * @param id 轮播图ID
     */
    @Override
    public void activateBanner(String id) {
        MiniBanner banner = getById(id);
        Assert.notNull(banner, () -> {
            log.error("轮播图自动激活失败, 轮播图不存在, ID [{}]", id);
            throw new RuntimeException("轮播图自动激活失败, 轮播图不存在");
        });
        Assert.isTrue(banner.getEnable(), () -> {
            log.error("轮播图自动激活失败, 轮播图已被禁用, ID [{}]", id);
            throw new RuntimeException("轮播图自动激活失败, 轮播图已被禁用");
        });
        Assert.isTrue(LocalDateTime.now().isAfter(banner.getShowStartTime()), () -> {
            log.error("轮播图自动激活失败, 轮播图未到自动激活时间, ID [{}]", id);
            throw new RuntimeException("轮播图自动激活失败, 轮播图未到自动激活时间");
        });

        BannerCacheDTO bannerCache = BeanUtil.copyProperties(banner, BannerCacheDTO.class);
        try {
            miniBannerRepository.writeBannerCache(bannerCache, banner.getShowEndTime());
            miniBannerRepository.dropActivateKey(id);
        } catch (Exception e) {
            log.error("激活轮播图失败, 轮播图: {}", bannerCache, e);
            throw new RuntimeException("激活轮播图失败");
        }
    }


    /**
     * 重建轮播图缓存
     *
     * @return 操作结果
     */
    @Override
    public R<?> rebuildBannerCache() {
        LocalDateTime now = LocalDateTime.now();
        List<MiniBanner> banners = lambdaQuery()
                .eq(MiniBanner::getEnable, true)
                .orderByDesc(MiniBanner::getSortWeight)
                .list();
        if (CollUtil.isEmpty(banners)) {
            return R.failed("当前无可用轮播图");
        }
        Map<Serializable, Long> pendingMap = new HashMap<>();
        List<MiniBanner> activatedList = new ArrayList<>();
        for (MiniBanner banner : banners) {
            if (banner.getShowStartTime() == null || banner.getShowStartTime().isBefore(now)) {
                activatedList.add(banner);
                continue;
            }
            long expireSeconds = Duration.between(now, banner.getShowStartTime()).getSeconds();
            pendingMap.put(banner.getId(), expireSeconds);
        }
        // 删除缓存中的轮播图
        miniBannerRepository.dropAllBannerCache();
        // 处理已生效的轮播图
        if (CollUtil.isNotEmpty(activatedList)) {
            Map<Long, LocalDateTime> expireTimeMap = activatedList.stream()
                    .collect(Collectors.toMap(MiniBanner::getId, MiniBanner::getShowEndTime));
            List<BannerCacheDTO> dtoList = BeanUtil.copyToList(activatedList, BannerCacheDTO.class);
            miniBannerRepository.writeBannerCacheBatch(dtoList, expireTimeMap);
        }
        // 处理待生效的轮播图
        if (CollUtil.isNotEmpty(pendingMap)) {
            miniBannerRepository.pendingActivateBatch(pendingMap);
        }

        return R.ok();
    }


    /**
     * 修改轮播图信息
     *
     * @param dto 轮播图修改参数
     * @return 操作结果(轮播图详情)
     */
    @Override
    @Transactional(rollbackFor = RuntimeException.class)
    public R<BannerDetailVO> modifyBanner(BannerUpdateDTO dto) {
        MiniBanner banner = null;
        if (StrUtil.isNotBlank(dto.getImageName())) {
            banner = lambdaQuery().eq(MiniBanner::getImageName, dto.getImageName()).last("LIMIT 1").one();
            if (ObjUtil.isNotNull(banner) && !ObjUtil.equals(banner.getId(), Long.valueOf(dto.getId()))) {
                return R.failed("修改失败, 轮播图名称重复");
            }
        }
        if (ObjUtil.isNull(banner)) {
            banner = getById(dto.getId());
            Assert.isTrue(ObjUtil.isNotNull(banner), () -> new RuntimeException("修改失败, 轮播图不存在"));
        }

        // 更新数据库
        CopyOptions copier = CopyOptions.create().ignoreNullValue();
        BeanUtil.copyProperties(dto, banner, copier);
        boolean result = updateById(banner);
        Assert.isTrue(result, () -> new RuntimeException("修改轮播图失败"));
        // 更新缓存
        miniBannerRepository.dropBannerCache(dto.getId());
        if (!banner.getEnable()) {
            return R.ok();
        }
        try {
            writeBannerCache(banner);
        } catch (Exception e) {
            log.error("修改轮播图缓存失败", e);
            throw new RuntimeException("修改轮播图缓存失败");
        }

        BannerDetailVO vo = BeanUtil.copyProperties(banner, BannerDetailVO.class);

        return R.ok(vo);
    }


    /**
     * 启用/禁用轮播图
     *
     * @param id 轮播图ID
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> enableBanner(String id) {
        /* step-1 检查轮播图状态 */
        MiniBanner banner = getById(id);
        if (ObjUtil.isNull(banner)) {
            return R.failed("轮播图不存在");
        }

        /* step-2 更新数据库轮播图状态 */
        banner.setEnable(!banner.getEnable());
        boolean result = updateById(banner);
        if (!result) {
            return R.failed("轮播图" + (banner.getEnable() ? "启用" : "禁用") + "失败");
        }

        /* step-3 更新缓存轮播图状态 */
        miniBannerRepository.dropBannerCache(id);
        if (!banner.getEnable()) {
            return R.ok();
        }
        try {
            writeBannerCache(banner);
        } catch (Exception e) {
            log.error("修改轮播图缓存失败", e);
            throw new RuntimeException("修改轮播图缓存失败");
        }

        return R.ok();
    }


    /**
     * 轮播图过期处理
     *
     * @param bannerId 轮播图ID
     */
    @Override
    public void expireBanner(String bannerId) {
        MiniBanner banner = getById(bannerId);
        if (ObjUtil.isNull(banner)) {
            log.error("轮播图过期处理失败, 轮播图不存在, 轮播图ID: {}", bannerId);
            throw new RuntimeException("轮播图过期处理失败, 轮播图不存在, 轮播图ID: " + bannerId);
        }

        banner.setEnable(false);
        boolean result = updateById(banner);
        if (!result) {
            log.error("轮播图过期处理失败, 轮播图禁用失败, 轮播图ID: {}", bannerId);
            throw new RuntimeException("轮播图过期处理失败, 轮播图禁用失败, 轮播图ID: " + bannerId);
        }

    }


    /**
     * 查询轮播图分页列表
     *
     * @param dto 轮播图查询参数
     * @return 查询结果(轮播图列表)
     */
    @Override
    public R<PageQueryVO<BannerListVO>> queryBanner(BannerQueryDTO dto) {
        Page<BannerListVO> pageData = miniBannerMapper.queryBanner(dto.page(), dto);
        return R.ok(PageQueryVO.of(pageData));
    }


    /**
     * 查询轮播图详情
     *
     * @param id 轮播图ID
     * @return 查询结果(轮播图详情)
     */
    @Override
    public R<BannerDetailVO> bannerDetail(String id) {
        BannerDetailVO vo = new BannerDetailVO();
        MiniBanner banner = getById(id);
        if (ObjUtil.isNull(banner)) {
            return R.ok(vo);
        }
        BeanUtil.copyProperties(banner, vo);

        return R.ok(vo);
    }


    /**
     * 获取首页轮播图
     *
     * @return 响应结果(首页轮播图列表)
     */
    @Override
    public R<List<MiniBannerVO>> getIndexBanner() {
        // 从缓存中获取
        List<BannerCacheDTO> bannerCaches = miniBannerRepository.scanBanner();
        if (CollUtil.isNotEmpty(bannerCaches)) {
            return R.ok(BeanUtil.copyToList(bannerCaches, MiniBannerVO.class));
        }

        // 缓存没有命中, 备选查询数据库
        LocalDateTime now = LocalDateTime.now();
        List<MiniBanner> banners = lambdaQuery()
                .eq(MiniBanner::getEnable, true)
                .ge(MiniBanner::getShowEndTime, now)
                .le(MiniBanner::getShowStartTime, now)
                .orderByDesc(MiniBanner::getSortWeight)
                .list();
        if (CollUtil.isEmpty(banners)) {
            log.error("获取首页轮播图失败, 数据库中无可用轮播图数据");
            return R.ok(List.of());
        }

        // 数据写入缓存
        List<BannerCacheDTO> cacheDTOs = BeanUtil.copyToList(banners, BannerCacheDTO.class);
        Map<Long, LocalDateTime> expireTimeMap = banners.stream()
                .collect(Collectors.toMap(MiniBanner::getId, MiniBanner::getShowEndTime));
        miniBannerRepository.writeBannerCacheBatch(cacheDTOs, expireTimeMap);

        return R.ok(BeanUtil.copyToList(banners, MiniBannerVO.class));
    }


    /**
     * private
     * 写入轮播图缓存 or 写入轮播图待生效缓存
     *
     * @param banner 轮播图实体
     */
    private void writeBannerCache(MiniBanner banner) {
        LocalDateTime now = LocalDateTime.now();
        if (banner.getShowStartTime() == null || banner.getShowStartTime().isBefore(now)) {
            // 未指定生效时间 || 生效时间已过
            BannerCacheDTO cacheDTO = BeanUtil.copyProperties(banner, BannerCacheDTO.class);
            miniBannerRepository.writeBannerCache(cacheDTO, banner.getShowEndTime());
        } else {
            // 未到生效时间
            long expireSeconds = Duration.between(now, banner.getShowStartTime()).getSeconds();
            miniBannerRepository.pendingActivate(banner.getId(), expireSeconds);
        }

    }


}