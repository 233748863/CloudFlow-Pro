package cn.joywon.poco.merchant.MerchantModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.admin.api.feign.RemoteAreaService;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.bo.MerchantSimpleInfoBO;
import cn.joywon.poco.merchant.MerchantModule.bo.MiniMerchantIndexBO;
import cn.joywon.poco.merchant.MerchantModule.bo.QualificationBO;
import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.dto.*;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.entity.MerchantAudit;
import cn.joywon.poco.merchant.MerchantModule.mapper.MerchantMapper;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.MerchantModule.util.StoreInfoReplace;
import cn.joywon.poco.merchant.MerchantModule.vo.*;
import cn.joywon.poco.merchant.PlatformModule.entity.Industry;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.math.NumberUtils;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MerchantServiceImpl extends ServiceImpl<MerchantMapper, Merchant> implements IMerchantService {

    // 商家入驻绑定码缓存键
    private static final String MERCHANT_BIND_CODE_KEY = "merchant:bind:code";

    private final RedisTemplate<String, Object> redisTemplate;

    private final RemoteAreaService remoteAreaService;

    private final MerchantMapper merchantMapper;


    /**
     * 商家入驻申请
     *
     * @param dto 商家入驻申请参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> create(MerchantCreateDTO dto) {
        Long merchantId = dto.getMerchantId() != null ? dto.getMerchantId() : getCurrentMerchantId();

        /* step-1 检查商家状态 & 所属行业状态 */
        Merchant entity = getById(merchantId);
        Assert.isNull(entity, () -> new CheckedException("提交申请失败, 已提交过入驻申请"));
        entity = lambdaQuery().eq(Merchant::getName, dto.getMerchantName()).last("LIMIT 1").one();
        if (entity != null) {
            return R.failed("提交申请失败, 已存在相同名称商家");
        }
        if (ObjUtil.isNotNull(dto.getIndustryId())) {
            Industry industry = Db.getById(dto.getIndustryId(), Industry.class);
            if (ObjUtil.isNull(industry)) {
                return R.failed("提交申请失败, 所属行业不存在");
            }
        }

        /* step-2 获取地址信息 */
        List<Long> regionCodes = strCodesToList(dto.getRegionCode());
        List<String> locations = getLocationNamesByRegionCodes(regionCodes);
        String location = locations.stream().filter(Objects::nonNull).collect(Collectors.joining(","));

        /* step-3 写入商家记录 */
        entity = new Merchant();
        CopyOptions copier = CopyOptions.create().setIgnoreProperties(Merchant::getImages, Merchant::getLicenseImages);
        BeanUtil.copyProperties(dto, entity, copier);
        String images = null, licenseImages = null;
        if (CollUtil.isNotEmpty(dto.getImages())) {
            images = JSONUtil.toJsonStr(dto.getImages());
        }
        if (CollUtil.isNotEmpty(dto.getLicenseImages())) {
            licenseImages = JSONUtil.toJsonStr(dto.getLicenseImages());
        }
        entity.setRegionCode(JSONUtil.toJsonStr(regionCodes));
        entity.setLicenseImages(licenseImages);
        entity.setName(dto.getMerchantName());
        entity.setLocation(location);
        entity.setImages(images);
        entity.setId(merchantId);
        boolean result = save(entity);
        Assert.isTrue(result, () -> new CheckedException("提交申请失败, 请重试"));

        /* step-4 写入商家审核记录 */
        MerchantAudit merchantAudit = BeanUtil.copyProperties(entity, MerchantAudit.class);
        merchantAudit.setMerchantId(entity.getId());
        merchantAudit.setAuditType(AuditStatusEnum.CREATE);
        merchantAudit.setLicenseImages(licenseImages);
        merchantAudit.setModifyReason("入驻创建");
        merchantAudit.setImages(images);
        merchantAudit.setId(null);
        result = Db.save(merchantAudit);
        Assert.isTrue(result, () -> new CheckedException("提交申请失败, 请重试"));

        /* step-5 更新商家记录关联的审核记录ID */
        entity = new Merchant();
        entity.setAuditId(merchantAudit.getId());
        entity.setId(merchantId);
        result = updateById(entity);
        Assert.isTrue(result, () -> new CheckedException("提交申请失败, 请重试"));

        return R.ok();
    }


    /**
     * 修改商家信息
     *
     * @param dto 商家信息修改参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> infoUpdate(MerchantUpdateDTO dto) {
        Long merchantId = getCurrentMerchantId();

        /* step-1 检查商家状态 */
        Merchant entity = null;
        // 检查新名称是否重名
        if (StrUtil.isNotBlank(dto.getName())) {
            entity = lambdaQuery().eq(Merchant::getName, dto.getName()).last("LIMIT 1").one();
            if (ObjUtil.isNotNull(entity) && !ObjUtil.equals(entity.getId(), merchantId)) {
                return R.failed("修改失败, 已存在相同名称商家");
            }
        }
        // 检查商家是否存在
        if (entity == null) {
            entity = getById(merchantId);
            if (ObjUtil.isNull(entity)) {
                return R.failed("修改失败, 该商家不存在");
            }
        }
        // 检查商家当前审核状态
        MerchantAudit merchantAudit = Db.getById(entity.getAuditId(), MerchantAudit.class);
        if (merchantAudit.getAuditStatus() == AuditStatusEnum.PENDING) {
            return R.failed("当前状态已在审批中, 请勿重复提交");
        }
        // 检查所选行业是否存在
        if (ObjUtil.isNotNull(dto.getIndustryId())) {
            Industry industry = Db.getById(dto.getIndustryId(), Industry.class);
            if (ObjUtil.isNull(industry)) {
                return R.failed("修改失败, 所属行业不存在");
            }
        }

        /* step-2 获取地址信息(如有) */
        String location = null;
        List<Long> regionCodes = null;
        if (StrUtil.isNotBlank(dto.getAddressDetail())) {
            regionCodes = strCodesToList(dto.getRegionCode());
            List<String> locations = getLocationNamesByRegionCodes(regionCodes);
            location = locations.stream().filter(Objects::nonNull).collect(Collectors.joining(","));
        }

        /* step-3 写入商家审核记录 */
        CopyOptions copier = CopyOptions.create().ignoreNullValue().setIgnoreProperties(Merchant::getImages);
        BeanUtil.copyProperties(dto, entity, copier);
        merchantAudit = new MerchantAudit();
        BeanUtil.copyProperties(entity, merchantAudit);
        if (StrUtil.isNotBlank(location) && StrUtil.isNotBlank(dto.getAddressDetail())) {
            merchantAudit.setRegionCode(JSONUtil.toJsonStr(regionCodes));
            merchantAudit.setLocation(location);
        }
        if (CollUtil.isNotEmpty(dto.getImages())) {
            merchantAudit.setImages(JSONUtil.toJsonStr(dto.getImages()));
        }
        merchantAudit.setAuditType(AuditStatusEnum.REVISION);
        merchantAudit.setModifyReason(dto.getModifyReason());
        merchantAudit.setMerchantId(entity.getId());
        merchantAudit.setAuditStatus(AuditStatusEnum.PENDING);
        merchantAudit.setId(null);
        boolean result = Db.save(merchantAudit);
        if (!result) {
            return R.failed("修改失败, 请重试");
        }

        /* step-4 更新商家记录关联的审核记录ID */
        entity = new Merchant();
        entity.setId(merchantId);
        entity.setAuditId(merchantAudit.getId());
        result = updateById(entity);
        if (!result) {
            throw new CheckedException("修改失败, 请重试");
        }

        return R.ok();
    }


    /**
     * 商家资质信息重新上传
     *
     * @param dto 商家资质信息参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> qualificationUpload(MerchantQualificationDTO dto) {
        Long merchantId = getCurrentMerchantId();

        /* step-1 检查商家状态 */
        Merchant entity = getById(merchantId);
        if (entity == null) {
            return R.failed("该商家不存在");
        }
        MerchantAudit merchantAudit = Db.getById(entity.getAuditId(), MerchantAudit.class);
        if (merchantAudit.getAuditStatus() == AuditStatusEnum.PENDING) {
            return R.failed("当前状态已在审批中, 请勿重复提交");
        }

        /* step-2 写入审核记录 */
        CopyOptions copier = CopyOptions.create().ignoreNullValue().setIgnoreProperties(Merchant::getLicenseImages);
        BeanUtil.copyProperties(dto, entity, copier);
        merchantAudit = new MerchantAudit();
        BeanUtil.copyProperties(entity, merchantAudit);
        merchantAudit.setAuditType(AuditStatusEnum.REVISION);
        merchantAudit.setModifyReason(dto.getModifyReason());
        merchantAudit.setMerchantId(entity.getId());
        merchantAudit.setAuditStatus(AuditStatusEnum.PENDING);
        merchantAudit.setId(null);
        if (CollUtil.isNotEmpty(dto.getLicenseImages())) {
            merchantAudit.setLicenseImages(JSONUtil.toJsonStr(dto.getLicenseImages()));
        }
        boolean result = Db.save(merchantAudit);
        if (!result) {
            return R.failed("修改失败, 请重试");
        }

        /* step-3 更新商家记录关联的审核记录ID */
        entity = new Merchant();
        entity.setAuditId(merchantAudit.getId());
        entity.setId(merchantId);
        result = updateById(entity);
        if (!result) {
            throw new CheckedException("修改失败, 请重试");
        }

        return R.ok();
    }


    /**
     * 获取商家列表
     *
     * @param dto 商家列表查询参数
     * @return 查询结果(商家列表分页)
     */
    @Override
    public R<PageQueryVO<MerchantListVO>> getList(MerchantListDTO dto) {
        if (CollUtil.isNotEmpty(dto.getRegionCodes())) {
            dto.setRegionCodeJsonStr(JSONUtil.toJsonStr(dto.getRegionCodes()));
        }
        Page<MerchantListVO> pageData = merchantMapper.getList(dto.page(), dto);
        return R.ok(PageQueryVO.of(pageData, i -> {
            i.setAddressDetail(StoreInfoReplace.removeLocationSeparator(i.getAddressDetail()));
            return i;
        }));
    }


    /**
     * 获取商家简要信息(不需要权限)
     *
     * @param merchantId 商家ID
     * @return 商家简要信息
     */
    @Override
    public R<MerchantSimpleInfoVO> getSimpleInfo(Long merchantId) {
        Object o = redisTemplate.opsForHash().get(MERCHANT_BIND_CODE_KEY, merchantId.toString());
        if (o == null) {
            return R.failed("获取失败, 绑定码已过期");
        }
        List<String> ids = Arrays.asList(o.toString().split(";"));

        Merchant merchant = getById(ids.get(1));
        Assert.notNull(merchant, () -> new RuntimeException("获取失败, 商家不存在"));

        MerchantSimpleInfoVO vo = new MerchantSimpleInfoVO();
        vo.setMerchantId(merchantId);
        vo.setMerchantLogoUrl(merchant.getLogoUrl());
        vo.setMerchantName(merchant.getName());
        if (merchant.getIndustryId() == null) {
            return R.ok(vo);
        }

        Industry industry = Db.getById(merchant.getIndustryId(), Industry.class);
        vo.setIndustryName(industry.getName());

        return R.ok(vo);
    }


    /**
     * 商家信息详情
     *
     * @return 商家信息
     */
    @Override
    public R<MerchantInfoVO> getInfo() {
        Long merchantId = getCurrentMerchantId();

        Merchant entity = getById(merchantId);
        if (ObjUtil.isNull(entity)) {
            return R.ok(null, "该商家不存在");
        }
        MerchantAudit merchantAudit = Db.getById(entity.getAuditId(), MerchantAudit.class);
        MerchantInfoVO vo = BeanUtil.copyProperties(entity, MerchantInfoVO.class);
        if (ObjUtil.isNotNull(entity.getIndustryId())) {
            Industry industry = Db.getById(entity.getIndustryId(), Industry.class);
            if (ObjUtil.isNotNull(industry)) {
                vo.setIndustryName(industry.getName());
            }
        }
        String regionCode = entity.getRegionCode();
        if (StrUtil.isNotBlank(regionCode) && StrUtil.startWith(regionCode, "[")) {
            vo.setRegionCode(String.join(",", JSONUtil.toList(regionCode, String.class)));
        } else {
            vo.setRegionCode(regionCode);
        }
        if (StrUtil.isNotBlank(entity.getImages())) {
            vo.setImages(JSONUtil.toList(entity.getImages(), String.class));
        }
        if (ObjUtil.isNull(merchantAudit)) {
            return R.ok(vo);
        }
        switch (merchantAudit.getAuditStatus()) {
            case PENDING -> vo.setAuditing(true);
            case APPROVED, REJECTED -> vo.setAuditing(false);
        }

        return R.ok(vo);
    }


    /**
     * 获取商家资质信息
     *
     * @return 商家资质信息
     */
    @Override
    public R<MerchantQualificationVO> getQualification() {
        Long merchantId = getCurrentMerchantId();

        Merchant entity = getById(merchantId);
        if (ObjUtil.isNull(entity)) {
            return R.ok(null, "该商家不存在");
        }
        MerchantAudit merchantAudit = Db.getById(entity.getAuditId(), MerchantAudit.class);

        MerchantQualificationVO vo = new MerchantQualificationVO();
        CopyOptions copier = CopyOptions.create().setIgnoreProperties(Merchant::getLicenseImages);
        BeanUtil.copyProperties(entity, vo, copier);
        if (StrUtil.isNotBlank(entity.getLicenseImages())) {
            vo.setLicenseImages(JSONUtil.toList(entity.getLicenseImages(), String.class));
        }
        if (!ObjUtil.isNotNull(merchantAudit)) {
            return R.ok(vo);
        }
        switch (merchantAudit.getAuditStatus()) {
            case PENDING -> vo.setAuditing(true);
            case APPROVED, REJECTED -> vo.setAuditing(false);
        }

        return R.ok(vo);
    }


    /**
     * 根据商家ID列表获取商家简要信息列表(携带行业信息)
     *
     * @param ids 商家ID列表
     * @return 商家简要信息列表
     */
    @Override
    public List<MerchantSimpleInfoBO> getMerchantSimpleInfoListWithIndustry(Collection<Long> ids) {
        return merchantMapper.getMerchantSimpleInfoListWithIndustry(ids);
    }


    /**
     * 根据商家ID列表获取商家简要信息列表
     *
     * @param ids 商家ID列表
     * @return 商家简要信息列表
     */
    @Override
    public List<MerchantSimpleInfoBO> getMerchantSimpleInfoList(Collection<Long> ids) {
        return merchantMapper.getMerchantSimpleInfoList(ids);
    }


    /**
     * 根据商家ID获取商家简要信息
     *
     * @param merchantId 商家ID
     * @return 商家简要信息
     */
    @Override
    public MerchantSimpleInfoVO getMerchantSimpleInfo(Long merchantId) {
        return merchantMapper.getMerchantSimpleInfo(merchantId);
    }


    /**
     * 【消费者端】
     * 获取商家首页信息
     *
     * @param merchantId 商家ID
     * @param longitude  用户地理经度
     * @param latitude   用户地理纬度
     * @return 查询结果(商家首页信息)
     */
    @Override
    public MiniMerchantIndexBO getMerchantIndexInfo(Long merchantId, Double longitude, Double latitude) {
        return merchantMapper.getMerchantIndexInfo(merchantId, longitude, latitude);
    }


    /**
     * 【消费者端】
     * 根据名称查询商家列表
     *
     * @param dto 查询参数
     * @return 查询结果(距离升序商家分页列表)
     */
    @Override
    public PageQueryVO<MiniMerchantListVO> queryMerchantByNameWithDistance(MiniStoreQueryDTO dto) {
        Page<MiniMerchantListVO> page = Page.of(dto.getPageNum(), dto.getPageSize());
        page = merchantMapper.queryMerchantByNameWithDistance(page, dto);

        return PageQueryVO.of(page);
    }


    /**
     * 【消费者端】
     * 获取商家详细信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家详细信息)
     */
    @Override
    public MiniMerchantInfoVO getMerchantInfo(Long merchantId) {
        return merchantMapper.getMerchantInfo(merchantId);
    }


    /**
     * 获取商家资质信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家资质信息)
     */
    @Override
    public QualificationBO getMerchantQualification(Long merchantId) {
        return merchantMapper.getMerchantQualification(merchantId);
    }


    /**
     * 获取商家图片
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家图片列表)
     */
    @Override
    public String getMerchantImages(Long merchantId) {
        return merchantMapper.getMerchantImages(merchantId);
    }


    /**
     * 设置平台默认商家信息
     *
     * @return 平台默认商家信息
     */
    @Override
    public MerchantSimpleInfoVO setPlatformMerchantInfo() {
        MerchantSimpleInfoVO vo = new MerchantSimpleInfoVO();
        vo.setMerchantName("官方平台");
        vo.setMerchantId(0L);
        return vo;
    }


    /**
     * 根据行业ID列表和地区ID列表查询商家列表
     *
     * @param regionCodes 地区ID列表
     * @param industryIds 行业ID列表
     * @return 商家简要信息列表
     */
    @Override
    public List<MerchantSimpleInfoBO> queryMerchantByIndustryAndRegions(List<Long> regionCodes, List<Long> industryIds) {
        return merchantMapper.queryMerchantByIndustryAndRegions(regionCodes, industryIds);
    }


    /**
     * 获取联合营销邀请商家列表
     *
     * @param dto 联合营销邀请商家查询参数
     * @return 查询结果(联合营销邀请商家信息列表)
     */
    @Override
    public R<PageQueryVO<MerchantSimpleInfoVO>> listForInviteJointMarketing(MerchantInviteQueryDTO dto) {
        if (CollUtil.isNotEmpty(dto.getRegionCodes())) {
            dto.setRegionCodeJson(JSONUtil.toJsonStr(dto.getRegionCodes()));
        }
        Page<MerchantSimpleInfoVO> pageData = merchantMapper.listForInviteJointMarketing(dto.page(), dto);

        return R.ok(PageQueryVO.of(pageData));
    }


    /**
     * private
     * 将逗号分割的地区编码字符串转化为地区编码列表
     *
     * @param strRegionCodes 地区编码字符串
     * @return 地区编码列表
     */
    private List<Long> strCodesToList(String strRegionCodes) {
        if (StrUtil.isBlank(strRegionCodes)) {
            throw new RuntimeException("提交失败, 请填写正确有效的地区编码");
        }
        List<Long> regionCodes = Arrays.stream(StringUtils.split(strRegionCodes, ","))
                .map(String::trim)
                .filter(s -> NumberUtils.isParsable(s) && NumberUtils.isCreatable(s))
                .map(NumberUtils::toLong)
                .toList();
        if (CollUtil.isEmpty(regionCodes) || regionCodes.size() < 2) {
            throw new RuntimeException("提交失败, 请填写正确有效的地区编码");
        }
        return regionCodes;
    }


    /**
     * private
     * 根据地区编码列表获取地区名称列表
     *
     * @param regionCodes 地区编码列表
     * @return 地区名称列表
     */
    private List<String> getLocationNamesByRegionCodes(List<Long> regionCodes) {
        R<List<String>> remoteResult = remoteAreaService.getLocationsByCodes(regionCodes);
        if (!remoteResult.isOk()) {
            throw new RuntimeException("提交失败, 请稍后重试");
        }
        List<String> locations = remoteResult.getData();
        if (CollUtil.isEmpty(locations) || locations.size() != regionCodes.size()) {
            throw new RuntimeException("提交失败, 请填写正确有效的地区编码");
        }
        return locations;
    }


    private Long getCurrentMerchantId() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            throw new RuntimeException("无效的登录用户");
        }
        return user.getDeptId();
    }


}