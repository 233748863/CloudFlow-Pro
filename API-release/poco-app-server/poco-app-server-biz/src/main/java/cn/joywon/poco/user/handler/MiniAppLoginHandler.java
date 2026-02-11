/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.user.handler;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.lang.UUID;
import cn.hutool.http.HttpUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.constant.SecurityConstants;
import cn.joywon.poco.common.core.constant.enums.LoginTypeEnum;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.MemberModule.dto.UserSyncDTO;
import cn.joywon.poco.merchant.MemberModule.fegin.UserFeignClient;
import cn.joywon.poco.user.api.dto.AppUserInfo;
import cn.joywon.poco.user.api.entity.AppSocialDetails;
import cn.joywon.poco.user.api.entity.AppUser;
import cn.joywon.poco.user.mapper.AppSocialDetailsMapper;
import cn.joywon.poco.user.service.AppUserService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Objects;

/**
 * @author poco
 * @date 2019年11月02日
 * <p>
 * 微信小程序
 */
@Slf4j
@Component("APP-MINI")
@AllArgsConstructor
public class MiniAppLoginHandler extends AbstractLoginHandler {

    private final UserFeignClient maUserFeignClient;

    private final AppUserService appUserService;

    private final AppSocialDetailsMapper appSocialDetailsMapper;

    private static final SecureRandom random = new SecureRandom();
    private static final String CHAR_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";

    /**
     * 小程序登录传入code
     * <p>
     * 通过code 调用qq 获取唯一标识
     *
     * @param code
     * @return
     */
    @Override
    public String identify(String code) {
        AppSocialDetails condition = new AppSocialDetails();
        condition.setType(LoginTypeEnum.MINI_APP.getType());
        AppSocialDetails socialDetails = appSocialDetailsMapper.selectOne(new QueryWrapper<>(condition));

        String url = String.format(SecurityConstants.MINI_APP_AUTHORIZATION_CODE_URL, socialDetails.getAppId(),
                socialDetails.getAppSecret(), code);
        String result = HttpUtil.get(url);
        log.debug("微信小程序响应报文:{}", result);

        if (JSONUtil.parseObj(result).containsKey("openid")) {
            return JSONUtil.parseObj(result).get("openid").toString();
        } else {
            log.error("微信小程序登录失败:{}", result);
            throw new CheckedException("微信小程序登录失败");
        }
    }

    /**
     * openId 获取用户信息
     *
     * @param openId
     * @return
     */
    @Override
    public AppUserInfo info(String openId) {
        AppUser user = appUserService.getOne(Wrappers.<AppUser>query().lambda().eq(AppUser::getWxOpenid, openId));

        // 未注册用户自动注册
        if (Objects.isNull(user)) {
            log.info("微信小程序未绑定:{},创建新的用户", openId);
            BCryptPasswordEncoder bCryptPasswordEncoder = new BCryptPasswordEncoder();
            AppUser appUser = new AppUser();
            appUser.setWxOpenid(openId);
            appUser.setCreateBy(openId);
            appUser.setUpdateBy(openId);
            String tempPwd = UUID.fastUUID().toString(true);   // 随机 32 位
            String salt = UUID.fastUUID().toString(true);
            String pwd = bCryptPasswordEncoder.encode(tempPwd);

            appUser.setUsername(generateRandomNickname(6));   // 或生成唯一用户名
            appUser.setPassword(pwd);
            appUser.setSalt(salt);
            appUser.setNickname(generateRandomNickname(8));
            appUserService.saveOrUpdate(appUser);

            // 新用户同步至商家联盟模块
            UserSyncDTO userSyncDto = BeanUtil.copyProperties(appUser, UserSyncDTO.class);
            log.info("同步新增小程序用户至商家联盟模块: {}", userSyncDto);
            R<?> remoteResult = maUserFeignClient.addUser(userSyncDto);
            Assert.isTrue(remoteResult.isOk(), () -> {
                log.error("同步小程序用户至商家联盟模块失败: {}", remoteResult.getMsg());
                throw new RuntimeException("同步小程序用户至商家联盟模块失败");
            });

            AppUserInfo appUserDTO = new AppUserInfo();
            appUserDTO.setAppUser(appUser);
            return appUserDTO;
        }

        return appUserService.findUserInfo(user);
    }

    /**
     * 绑定逻辑
     *
     * @param user     用户实体
     * @param identify 渠道返回唯一标识
     * @return
     */
    @Override
    public Boolean bind(AppUser user, String identify) {
        user.setWxOpenid(identify);
        appUserService.updateById(user);
        return true;
    }

    private static String generateRandomNickname(int length) {
        if (length <= 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            int index = random.nextInt(CHAR_POOL.length());
            sb.append(CHAR_POOL.charAt(index));
        }
        return sb.toString();
    }

}
