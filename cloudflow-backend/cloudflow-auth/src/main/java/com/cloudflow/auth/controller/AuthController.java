package com.cloudflow.auth.controller;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.LoginBody;
import com.cloudflow.auth.domain.RegisterBody;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 认证控制器
 * 重构：使用 Spring Cache 缓存用户信息和菜单，参考 Poco 架构
 * - 登录时通过 findUserInfo 获取用户信息（自动缓存到 Redis）
 * - 菜单树通过 selectMenuTreeByUserId 获取（自动缓存到 Redis）
 * - 不再手动操作 RedisCache 存储菜单
 */
@RestController
public class AuthController {

    @Autowired
    private TokenService tokenService;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private ISysMenuService menuService;

    @Autowired
    private ISysUserService sysUserService;

    @Autowired
    private com.cloudflow.auth.service.CaptchaService captchaService;

    @PostMapping("/login")
    public R<?> login(@RequestBody @Validated LoginBody form, HttpServletRequest request) {
        // 验证码校验
        if (!captchaService.validatePassToken(form.getCaptchaToken())) {
            return R.fail("验证码失效或错误，请重新验证");
        }

        // 查询用户（直接查库验证密码，不走缓存）
        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getUserName, form.getUsername());
        SysUser user = sysUserMapper.selectOne(queryWrapper);

        if (user == null) {
            return R.fail("用户不存在");
        }

        if (!BCrypt.checkpw(form.getPassword(), user.getPassword())) {
            return R.fail("密码错误");
        }

        // 记录登录IP和时间
        String loginIp = getClientIp(request);
        user.setLoginIp(loginIp);
        user.setLoginDate(new Date());
        sysUserMapper.updateById(user);

        // 通过 Spring Cache 获取用户完整信息（含角色+权限，自动缓存）
        UserInfo userInfo = sysUserService.findUserInfo(form.getUsername());
        if (userInfo == null) {
            return R.fail("获取用户信息失败");
        }

        // 创建 Token 并存入 Redis（Token 缓存仍用原有机制）
        Map<String, Object> loginUser = new HashMap<>();
        loginUser.put("userId", user.getUserId());
        loginUser.put("username", user.getUserName());
        loginUser.put("nickName", user.getNickName());
        loginUser.put("deptId", user.getDeptId());
        loginUser.put("avatar", user.getAvatar());
        loginUser.put("roles", userInfo.getRoles());
        loginUser.put("permissions", userInfo.getPermissions());

        String token = tokenService.createToken(loginUser);

        Map<String, String> result = new HashMap<>();
        result.put("token", token);
        return R.ok(result);
    }

    @PostMapping("/register")
    public R<?> register(@RequestBody @Validated RegisterBody registerBody) {
        if (!captchaService.validatePassToken(registerBody.getCaptchaToken())) {
            return R.fail("验证码失效或错误，请重新验证");
        }

        if (!registerBody.getPassword().equals(registerBody.getConfirmPassword())) {
            return R.fail("两次输入的密码不一致");
        }

        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getUserName, registerBody.getUsername());
        if (sysUserMapper.selectCount(queryWrapper) > 0) {
            return R.fail("用户 '" + registerBody.getUsername() + "' 已存在");
        }

        SysUser user = new SysUser();
        user.setUserName(registerBody.getUsername());
        user.setNickName(registerBody.getUsername());
        user.setPassword(registerBody.getPassword());
        user.setEmail(registerBody.getEmail());
        user.setStatus("0");
        user.setDelFlag("0");

        sysUserService.insertUser(user);

        return R.ok("注册成功");
    }

    @GetMapping("/info")
    public R<?> info(HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
        }

        Map<String, Object> userMap = tokenService.verifyToken(token);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        String username = (String) userMap.get("username");

        // 从 Spring Cache 获取用户完整信息（命中缓存则不查库）
        UserInfo userInfo = sysUserService.findUserInfo(username);
        if (userInfo == null) {
            return R.fail(401, "用户信息不存在");
        }

        SysUser cachedUser = userInfo.getSysUser();

        // 构建返回对象
        SysUser user = new SysUser();
        user.setUserId(cachedUser.getUserId());
        user.setUserName(cachedUser.getUserName());
        user.setNickName(cachedUser.getNickName());
        user.setAvatar(cachedUser.getAvatar());

        if (user.getAvatar() == null) {
            user.setAvatar("https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.getUserName());
        }

        // 从缓存的角色集合中取第一个作为主角色
        String resolvedRole = "USER";
        if (userInfo.getRoles() != null && !userInfo.getRoles().isEmpty()) {
            resolvedRole = userInfo.getRoles().iterator().next().toUpperCase();
        }
        user.setRole(resolvedRole);

        Map<String, Object> data = new HashMap<>();
        data.put("user", user);
        data.put("roles", userInfo.getRoles());
        data.put("permissions", userInfo.getPermissions());

        return R.ok(data);
    }

    /**
     * 获取路由信息（菜单树）- 通过 Spring Cache 自动缓存
     */
    @GetMapping("/getRouters")
    public R<?> getRouters(HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
        }

        Map<String, Object> userMap = tokenService.verifyToken(token);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        Object userIdObj = userMap.get("userId");
        Long userId;
        if (userIdObj instanceof Integer) {
            userId = ((Integer) userIdObj).longValue();
        } else {
            userId = (Long) userIdObj;
        }

        // 通过 Spring Cache 获取菜单树（@Cacheable 自动缓存，菜单变更时自动失效）
        List<SysMenu> menus = menuService.selectMenuTreeByUserId(userId);
        return R.ok(menus);
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}
