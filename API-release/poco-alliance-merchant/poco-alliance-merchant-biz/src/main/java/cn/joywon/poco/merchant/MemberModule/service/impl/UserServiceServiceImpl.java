package cn.joywon.poco.merchant.MemberModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.admin.api.feign.RemoteAreaService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.MemberModule.dto.UserSyncDTO;
import cn.joywon.poco.merchant.MemberModule.entity.User;
import cn.joywon.poco.merchant.MemberModule.mapper.UserMapper;
import cn.joywon.poco.merchant.MemberModule.service.IUserService;
import cn.joywon.poco.merchant.MemberModule.util.Base62Util;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.service.IPointsAccountService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RefreshScope
@RequiredArgsConstructor
public class UserServiceServiceImpl extends ServiceImpl<UserMapper, User> implements IUserService {

    @Value("${joywon.ma.salt.member.inviteCode}")
    private Long inviteCodeSalt;

    private final RemoteAreaService remoteAreaService;

    private final IPointsAccountService pointsAccountService;

    private final UserMapper userMapper;


    /**
     * 同步添加用户
     *
     * @param dto 用户同步参数
     * @return 操作结果
     */
    @Override
    public R<?> addUser(UserSyncDTO dto) {
        log.info("商家联盟模块处理小程序新增用户: {}", dto);
        /* step-1 解析地址code */
        String location = parseLocation(dto.getProvinceCode(), dto.getCityCode());

        /* step-2 生成当前用户邀请码 */
        long encryptedId = dto.getUserId() ^ inviteCodeSalt;
        String encode = Base62Util.encode(encryptedId);

        /* step-3 写入数据库 */
        User entity = BeanUtil.copyProperties(dto, User.class);
        entity.setLastLoginTime(LocalDateTime.now());
        entity.setLocation(location);
        entity.setInviteCode(encode);
        boolean result = save(entity);
        Assert.isTrue(result, () -> {
            log.error("同步新增用户失败, dto: {}", dto);
            throw new RuntimeException("同步新增用户失败");
        });

        /* step-4 创建积分账户 */
        Long pointsAccountId = pointsAccountService.createPointsAccount(entity.getUserId(), PointsEnum.USER);
        entity.setPointsAccount(pointsAccountId);
        result = updateById(entity);
        Assert.isTrue(result, () -> {
            log.error("同步新增用户 [{}] 积分账户 [{}] 失败", entity.getUserId(), pointsAccountId);
            throw new RuntimeException("同步新增用户积分账户失败");
        });

        return R.ok();
    }


    /**
     * 同步更新用户
     *
     * @param dto 用户同步参数
     * @return 响应结果
     */
    @Override
    public R<?> updateUser(UserSyncDTO dto) {
        Long currentUserId = getCurrentUserId();
        String location = parseLocation(dto.getProvinceCode(), dto.getCityCode());

        User entity = getById(dto.getUserId());
        if (ObjUtil.isNull(entity)) {
            log.error("用户[{}]尝试更新不存在的用户的信息", currentUserId);
            throw new RuntimeException("无效的登录用户");
        }
        if (!ObjUtil.equals(dto.getUserId(), currentUserId)) {
            log.error("用户[{}]尝试更新其他用户[{}]的信息", currentUserId, dto.getUserId());
            throw new RuntimeException("无效的登录用户");
        }

        CopyOptions copier = CopyOptions.create().ignoreNullValue();
        BeanUtil.copyProperties(dto, entity, copier);
        entity.setLocation(StrUtil.isBlank(location) ? entity.getLocation() : location);
        boolean result = updateById(entity);
        if (!result) {
            log.error("同步更新用户失败, dto: {}", dto);
            return R.failed("同步更新用户失败");
        }

        return R.ok();
    }


    /**
     * 同步删除用户
     *
     * @param ids 用户id
     * @return 响应结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> deleteUser(Long[] ids) {
        List<Long> userIds = CollUtil.toList(ids);
        Assert.notEmpty(userIds, () -> new RuntimeException("无效的用户ID"));

        List<Long> pointsAccountIds = userMapper.getUsersPointAccountIds(userIds);
        pointsAccountService.deletePointsAccounts(pointsAccountIds);

        int count = userMapper.deleteUsers(userIds);
        Assert.isTrue(count == userIds.size(), () -> {
            log.error("同步删除用户失败, 用户ID: {}", userIds);
            throw new RuntimeException("同步删除用户失败");
        });

        return R.ok();
    }


    /**
     * 解析地址code为地址字符串
     *
     * @param adCode 地址code
     * @return 地址字符串
     */
    private String parseLocation(Long... adCode) {
        // 过滤掉 null 值,避免 List.of() 抛出 NullPointerException
        List<Long> adCodes = CollUtil.newArrayList(adCode);
        // 移除所有 null 元素
        adCodes.removeIf(ObjUtil::isNull);
        
        if (CollUtil.isEmpty(adCodes)) {
            return null;
        }
        
        R<List<String>> remoteResult = remoteAreaService.getLocationsByCodes(adCodes);
        List<String> locations = remoteResult.getData();
        if (remoteResult.isOk() && CollUtil.isNotEmpty(locations)) {
            return String.join("", locations);
        }
        return null;
    }


    private Long getCurrentUserId() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            throw new RuntimeException("无效的登录用户");
        }
        return user.getId();
    }

}