package com.cloudflow.auth.controller;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.LoginBody;
import com.cloudflow.auth.domain.RegisterBody;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.common.core.utils.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
public class AuthController {

    @Autowired
    private TokenService tokenService;
    
    @Autowired
    private SysUserMapper sysUserMapper;
    
    @Autowired
    private SysRoleMapper sysRoleMapper;
    
    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;
    
    @Autowired
    private ISysMenuService menuService;

    @Autowired
    private com.cloudflow.auth.service.ISysUserService sysUserService;

    @Autowired
    private com.cloudflow.auth.service.CaptchaService captchaService;

    @PostMapping("/login")
    public R<?> login(@RequestBody @Validated LoginBody form, HttpServletRequest request) {
        // Verify Captcha
        if (!captchaService.validatePassToken(form.getCaptchaToken())) {
             return R.fail("验证码失效或错误，请重新验证");
        }

        // 查询数据库
        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getUserName, form.getUsername());
        SysUser user = sysUserMapper.selectOne(queryWrapper);

        if (user == null) {
            return R.fail("用户不存在");
        }

        // 前端发送的是 SHA-256 哈希后的密码，后端需要对其再次 BCrypt 加密后比对
        // 由于前端每次哈希结果相同，我们需要对前端哈希进行 BCrypt 加密后存储
        // 登录时：前端发送 SHA-256(password)，后端用 BCrypt.checkpw(SHA-256(password), stored_bcrypt_hash)
        if (!BCrypt.checkpw(form.getPassword(), user.getPassword())) {
            return R.fail("密码错误");
        }
        
        // 记录登录IP和登录时间
        String loginIp = getClientIp(request);
        user.setLoginIp(loginIp);
        user.setLoginDate(new Date());
        sysUserMapper.updateById(user);

        // 查询角色
        LambdaQueryWrapper<SysUserRole> urWrapper = new LambdaQueryWrapper<>();
        urWrapper.eq(SysUserRole::getUserId, user.getUserId());
        List<SysUserRole> userRoles = sysUserRoleMapper.selectList(urWrapper);
        
        Set<String> roles = new HashSet<>();
        if (userRoles != null && !userRoles.isEmpty()) {
            for (SysUserRole ur : userRoles) {
                SysRole role = sysRoleMapper.selectById(ur.getRoleId());
                if (role != null) {
                    roles.add(role.getRoleKey());
                }
            }
        }
        
        // 查询权限
        Set<String> permissions = menuService.selectMenuPermsByUserId(user.getUserId());
        
        // 创建 Token 并存入 Redis
        Map<String, Object> loginUser = new HashMap<>();
        loginUser.put("userId", user.getUserId());
        loginUser.put("username", user.getUserName());
        loginUser.put("nickName", user.getNickName());
        loginUser.put("deptId", user.getDeptId());
        loginUser.put("avatar", user.getAvatar()); // Cache avatar
        loginUser.put("roles", roles); // Cache roles
        loginUser.put("permissions", permissions); // Cache permissions
        
        String token = tokenService.createToken(loginUser);
        
        Map<String, String> result = new HashMap<>();
        result.put("token", token);
        return R.ok(result);
    }
    
    @PostMapping("/register")
    public R<?> register(@RequestBody @Validated RegisterBody registerBody) {
        // Verify Captcha
        if (!captchaService.validatePassToken(registerBody.getCaptchaToken())) {
             return R.fail("验证码失效或错误，请重新验证");
        }
        
        if (!registerBody.getPassword().equals(registerBody.getConfirmPassword())) {
            return R.fail("两次输入的密码不一致");
        }
        
        // Check if username exists
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
        user.setStatus("0"); // Normal status
        user.setDelFlag("0");
        
        // Use service to insert (handles password encryption)
        sysUserService.insertUser(user);
        
        return R.ok("注册成功");
    }

    /**
     * 获取客户端真实IP地址
     */
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
        // 多个代理时取第一个IP
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
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
        
        // 优先从缓存构建返回对象，减少 DB 查询
        SysUser user = new SysUser();
        // Handle Integer/Long conversion from JSON
        Object userIdObj = userMap.get("userId");
        if (userIdObj instanceof Integer) {
             user.setUserId(((Integer) userIdObj).longValue());
        } else {
             user.setUserId((Long) userIdObj);
        }
        
        user.setUserName((String) userMap.get("username"));
        user.setNickName((String) userMap.get("nickName"));
        user.setAvatar((String) userMap.get("avatar"));
        
        if (user.getAvatar() == null) {
             user.setAvatar("https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.getUserName());
        }

        // Roles - handle both List and Set (HashSet stored during login, may deserialize as List or Set)
        Object rolesObj = userMap.get("roles");
        String resolvedRole = "USER";
        if (rolesObj instanceof java.util.Collection) {
            java.util.Collection<?> rolesCollection = (java.util.Collection<?>) rolesObj;
            if (!rolesCollection.isEmpty()) {
                Object firstRole = rolesCollection.iterator().next();
                if (firstRole != null) {
                    resolvedRole = firstRole.toString().toUpperCase();
                }
            }
        } else if (rolesObj instanceof String) {
            resolvedRole = ((String) rolesObj).toUpperCase();
        }
        user.setRole(resolvedRole);
        
        // Return permissions in a separate field or extend SysUser?
        // Since SysUser is a DB entity, maybe better to return a Map or DTO
        // For now, let's just return SysUser and frontend can get permissions from separate API if needed
        // OR extend R return.
        // Let's modify return type to Map to include permissions
        Map<String, Object> data = new HashMap<>();
        data.put("user", user);
        data.put("roles", userMap.get("roles"));
        data.put("permissions", userMap.get("permissions"));
        
        return R.ok(data);
    }
}
