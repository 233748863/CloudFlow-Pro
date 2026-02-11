package cn.joywon.poco.merchant.PlatformModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.admin.api.dto.UserDTO;
import cn.joywon.poco.admin.api.entity.SysUser;
import cn.joywon.poco.admin.api.feign.RemoteUserService;
import cn.joywon.poco.admin.api.vo.UserNameVO;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.dto.AuditResultDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantAuditQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantCreateDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.entity.MerchantAudit;
import cn.joywon.poco.merchant.MerchantModule.entity.Store;
import cn.joywon.poco.merchant.MerchantModule.vo.*;
import cn.joywon.poco.merchant.PlatformModule.dto.MerchantCreateByPlatformDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.Industry;
import cn.joywon.poco.merchant.PlatformModule.mapper.MerchantAuditMapper;
import cn.joywon.poco.merchant.PlatformModule.service.IMerchantAdminService;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.service.IPointsAccountService;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum.APPROVED;
import static cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum.REJECTED;

@Slf4j
@Service
@RequiredArgsConstructor
public class MerchantAdminServiceImpl extends
        ServiceImpl<MerchantAuditMapper, MerchantAudit> implements IMerchantAdminService {

    @Value("${joywon.mini.assistant-app-id}")
    private String assistantAppId;

    @Value("${joywon.mini.assistant-app-secret}")
    private String assistantAppSecret;

    @Value("${joywon.mini.access-token-url}")
    private String accessTokenUrl;

    @Value("${joywon.mini.code-un-limit-url}")
    private String aCodeUnLimitUrl;

    @Value("${joywon.mini.code-un-limit-width}")
    private String codeUnLimitWidth;

    @Value("${joywon.mini.merchant-bind-page}")
    private String merchantBindPage;

    // 商家入驻绑定码缓存键
    private static final String MERCHANT_BIND_CODE_KEY = "merchant:bind:code";

    // 小程序access_token缓存键
    private static final String ACCESS_TOKEN_KEY = "mini:app:access:token";

    // 小程序access_token缓存过期时间(毫秒)
    private static final long ACCESS_TOKEN_EXPIRE_IN = 2L * 60 * 60;

    private final RestTemplate restTemplate;

    private final RedisTemplate<String, Object> redisTemplate;

    private final RemoteUserService remoteUserService;

    private final IPointsAccountService pointsAccountService;

    private final MerchantAuditMapper merchantAuditMapper;


    /**
     * 平台创建商家
     *
     * @param dto 商家创建参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public MerchantCreateDTO createMerchantPlatformAccount(MerchantCreateByPlatformDTO dto) {
        UserDTO sysUser = new UserDTO();
        sysUser.setAvatar(dto.getLogoUrl());
        sysUser.setUserId(dto.getOrderSort());
        sysUser.setName(dto.getLegalPerson());
        sysUser.setUsername(dto.getUserName());
        sysUser.setPhone(dto.getContactPhone());
        sysUser.setNickname(dto.getMerchantName());
        R<Long> remoteResult = remoteUserService.createMerchantUser(sysUser);
        Assert.isTrue(remoteResult.isOk() && remoteResult.getData() != null,
                () -> new RuntimeException("创建商家失败: 创建商家平台账号失败"));
        Long merchantId = remoteResult.getData();
        MerchantCreateDTO merchantCreateDto = BeanUtil.copyProperties(dto, MerchantCreateDTO.class);
        merchantCreateDto.setMerchantId(merchantId);

        return merchantCreateDto;
    }

    /**
     * 商家信息审核
     *
     * @param dto 审核参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> auditHandle(AuditResultDTO dto) {
        /* step-1 检查审核记录状态 */
        MerchantAudit entity = getById(dto.getAuditId());
        if (entity == null) {
            return R.failed("未查询到该申请记录");
        }
        AuditStatusEnum auditStatus = entity.getAuditStatus();
        if (auditStatus == APPROVED || auditStatus == REJECTED) {
            return R.failed("该申请记录已处理, 不能重复操作");
        }
        Merchant merchant = Db.getById(entity.getMerchantId(), Merchant.class);
        if (merchant == null) {
            log.error("MerchantAdminServiceImpl#applyAudit() --- 审批商家过程出现错误, 未能根据商家ID查询到数据, 商家ID: {}",
                    entity.getMerchantId());
            return R.failed("未查询到该商家信息");
        }

        entity.setAuditTime(LocalDateTime.now());
        entity.setAuditBy(getCurrentUser().getId());
        entity.setAuditRemark(dto.getAuditRemark());
        entity.setAuditStatus(AuditStatusEnum.valueOf(dto.getAuditResult()));

        /* step-2 判断是否为审核拒绝 */
        if (entity.getAuditStatus() == REJECTED) {
            boolean result = updateById(entity);
            if (!result) {
                return R.failed("更新审核记录失败");
            }
            // TODO MMX 推送审核结果
            return R.ok();
        }

        /* step-3 不为审核拒绝 */
        // 判断是否为审批入驻创建
        if (entity.getAuditType() == AuditStatusEnum.CREATE) {
            // 更新商家信息 & 审核信息
            Long merchantId = entity.getMerchantId();
            merchant = new Merchant();
            merchant.setEnable(true);
            merchant.setId(merchantId);
            merchant.setBusinessStatus(BusinessStatusEnum.MERCHANT_OPERATING);
            boolean result = Db.updateById(merchant);
            if (!result) {
                return R.failed("审批商家入驻申请失败");
            }
            entity.setEnable(true);
            entity.setBusinessStatus(BusinessStatusEnum.MERCHANT_OPERATING);
            result = updateById(entity);
            Assert.isTrue(result, () -> {
                log.error("商家入驻信息更新失败, 商家ID: {}", merchantId);
                throw new RuntimeException("商家入驻信息更新失败");
            });
            // 为商家创建积分账户
            Long pointsAccountId = pointsAccountService.createPointsAccount(merchantId, PointsEnum.MERCHANT);
            merchant.setPointsAccount(pointsAccountId);
            result = Db.updateById(merchant);
            Assert.isTrue(result, () -> {
                log.error("商家ID [{}] 绑定积分账户 [{}] 失败", merchantId, pointsAccountId);
                pointsAccountService.removeById(pointsAccountId);
                throw new RuntimeException("商家绑定积分账户失败");
            });

            // TODO MMX 推送审核结果
            return R.ok();
        }

        // 不为审批入驻创建, 则为审批修改
        CopyOptions copier = CopyOptions.create()
                .setIgnoreProperties(Merchant::getId, Merchant::getCreatedBy, Merchant::getCreatedTime);
        BeanUtil.copyProperties(entity, merchant, copier);
        boolean result = Db.updateById(merchant);
        if (!result) {
            return R.failed("更新商家信息失败");
        }
        result = updateById(entity);
        if (!result) {
            // !!! 抛出自定义异常触发事务回滚
            throw new RuntimeException("更新审核记录失败");
        }
        // !!! 推送审核结果

        return R.ok();
    }

    /**
     * 获取商家审核列表
     *
     * @param dto 审核列表查询参数
     * @return 查询结果(商家审核列表分页)
     */
    @Override
    public R<PageQueryVO<MerchantAuditListVO>> getAuditList(MerchantAuditQueryDTO dto) {
        Page<MerchantAuditListVO> pageData = merchantAuditMapper.getAuditList(dto.page(), dto);
        return R.ok(PageQueryVO.of(pageData));
    }


    /**
     * 获取商家详情
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家详情)
     */
    @Override
    public R<MerchantDetailVO> getDetail(Long merchantId) {
        Merchant merchant = Db.getById(merchantId, Merchant.class);
        if (ObjUtil.isNull(merchant)) {
            return R.ok(new MerchantDetailVO());
        }

        MerchantDetailVO vo = new MerchantDetailVO();
        MerchantAudit entity = getById(merchant.getAuditId());
        // 填充商家信息主要数据
        BeanUtil.copyProperties(merchant, vo);
        vo.setRegionCode(String.join(",", JSONUtil.toList(merchant.getRegionCode(), String.class)));
        if (StrUtil.isNotBlank(merchant.getImages())) {
            vo.setImages(JSONUtil.toList(merchant.getImages(), String.class));
        }
        if (StrUtil.isNotBlank(merchant.getLicenseImages())) {
            vo.setLicenseImages(JSONUtil.toList(merchant.getLicenseImages(), String.class));
        }
        // 填充审核人名称
        if (!ObjUtil.isNull(entity.getAuditBy())) {
            R<List<UserNameVO>> remoteResult = remoteUserService.getUserNames(List.of(entity.getAuditBy()));
            if (remoteResult.isOk() && CollUtil.isNotEmpty(remoteResult.getData())) {
                vo.setAuditName(remoteResult.getData().get(0).getUserName());
            }
        }
        // 填充门店列表
        List<Store> stores = Db.lambdaQuery(Store.class)
                .eq(Store::getMerchantId, merchantId)
                .orderByDesc(Store::getBusinessStatus)
                .orderByDesc(Store::getEnable)
                .orderByDesc(Store::getCreatedTime)
                .list();
        if (CollUtil.isNotEmpty(stores)) {
            vo.setStores(BeanUtil.copyToList(stores, StoreListVO.class));
        }
        // 填充行业分类名称
        if (ObjUtil.isNotNull(merchant.getIndustryId())) {
            Industry industryEntity = Db.getById(merchant.getIndustryId(), Industry.class);
            if (ObjUtil.isNotNull(industryEntity)) {
                vo.setIndustryName(industryEntity.getName());
            }
        }

        return R.ok(vo);
    }


    /**
     * 获取商家待审核详情
     *
     * @param id 审核记录ID
     * @return 商家待审核详情
     */
    @Override
    public R<MerchantAuditDetailVO> getAuditDetail(Long id) {
        MerchantAudit entity = getById(id);
        if (entity == null) {
            return R.ok(null, "未查询到该待审核记录");
        }

        MerchantAuditDetailVO vo = BeanUtil.copyProperties(entity, MerchantAuditDetailVO.class);
        if (ObjUtil.isNotNull(entity.getIndustryId())) {
            Industry industryEntity = Db.getById(entity.getIndustryId(), Industry.class);
            if (ObjUtil.isNotNull(industryEntity)) {
                vo.setIndustryName(industryEntity.getName());
            }
        }
        if (StrUtil.isNotBlank(entity.getImages())) {
            vo.setImages(JSONUtil.toList(entity.getImages(), String.class));
        }
        if (StrUtil.isNotBlank(entity.getLicenseImages())) {
            vo.setLicenseImages(JSONUtil.toList(entity.getLicenseImages(), String.class));
        }
        vo.setRegionCode(String.join(",", JSONUtil.toList(entity.getRegionCode(), String.class)));
        vo.setAuditId(entity.getId());

        return R.ok(vo);
    }


    /**
     * 商家获取当前审核状态
     *
     * @return 查询结果(当前审核状态)
     */
    @Override
    public R<AuditStatusVO> getAuditStatus() {
        Merchant merchant = Db.getById(getCurrentUser().getDeptId(), Merchant.class);
        AuditStatusVO vo = new AuditStatusVO();
        if (ObjUtil.isNull(merchant)) {
            return R.ok(vo);
        }
        MerchantAudit entity = getById(merchant.getAuditId());
        if (ObjUtil.isNull(entity)) {
            return R.ok(vo);
        }
        BeanUtil.copyProperties(entity, vo);
        vo.setAuditId(entity.getId());

        return R.ok(vo);
    }


    /**
     * 获取商家审核历史列表
     *
     * @param dto 审核历史查询参数
     * @return 审核历史列表
     */
    @Override
    public R<PageQueryVO<AuditStatusVO>> getAuditHistoryList(MerchantAuditQueryDTO dto) {
        Long deptId = getCurrentUser().getDeptId();
        Merchant merchant = Db.getById(deptId, Merchant.class);
        if (ObjUtil.isNull(merchant)) {
            return R.ok(PageQueryVO.empty(dto.page()));
        }
        dto.setMerchantId(deptId);
        Page<AuditStatusVO> pageData = merchantAuditMapper.getAuditHistoryList(dto.page(), dto);

        return R.ok(PageQueryVO.of(pageData));
    }


    /**
     * 生成商家绑定微信身份二维码
     *
     * @param merchantId 商家ID
     * @return 响应结果
     */
    @Override
    public byte[] generateMerchantBindWxCode(String merchantId) {
        R<SysUser> remoteResult = remoteUserService.getUserByDeptId(merchantId);
        if (remoteResult == null || !remoteResult.isOk() || remoteResult.getData() == null) {
            throw new RuntimeException("无效的商家ID");
        }

        String accessToken = getAccessToken();
        String generateCodeUrl = aCodeUnLimitUrl + accessToken;
        String requestBody = convertACodeUnLimitParams(remoteResult.getData().getUserId().toString(), merchantId);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<String> requestEntity = new HttpEntity<>(requestBody, headers);

        ResponseEntity<byte[]> responseEntity = restTemplate.postForEntity(generateCodeUrl, requestEntity, byte[].class);
        if (!responseEntity.getStatusCode().is2xxSuccessful()) {
            return null;
        }

        return responseEntity.getBody();
    }


    private PocoUser getCurrentUser() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            throw new RuntimeException("无效的登录用户");
        }
        return user;
    }


    private String getAccessToken() {
        String accessToken;
        Object cache = redisTemplate.opsForValue().get(ACCESS_TOKEN_KEY);
        if (cache != null) {
            accessToken = cache.toString();
        } else {
            // 缓存中没有数据, 向微信服务请求获得access_token
            Map<String, String> paramsMap = Map.of("appId", assistantAppId, "appSecret", assistantAppSecret);
            ResponseEntity<String> response = restTemplate.getForEntity(accessTokenUrl, String.class, paramsMap);
            Assert.isTrue(response.getStatusCode().is2xxSuccessful(),
                    () -> new RuntimeException("请求微信接口获取小程序access_token失败"));
            accessToken = JSONUtil.parseObj(response.getBody()).getStr("access_token");
            saveAppAccessTokenCache(accessToken);
        }
        return accessToken;
    }


    private void saveAppAccessTokenCache(String accessToken) {
        redisTemplate.opsForValue().set(ACCESS_TOKEN_KEY, accessToken, ACCESS_TOKEN_EXPIRE_IN, TimeUnit.SECONDS);
    }


    private String convertACodeUnLimitParams(String merchantUserId, String merchantId) {
        String hValue = merchantUserId + ";" + merchantId;
        redisTemplate.opsForHash().put(MERCHANT_BIND_CODE_KEY, merchantId, hValue);

        String scene = "id=" + merchantId;
        Map<Object, Object> paramsMap = Map.of(
                "scene", scene,
                "page", merchantBindPage,
                "width", codeUnLimitWidth,
                "check_path", false);
        return JSONUtil.toJsonStr(paramsMap);
    }


}