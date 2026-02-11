package cn.joywon.poco.merchant.MemberModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.MemberModule.dto.UserSyncDTO;
import cn.joywon.poco.merchant.MemberModule.service.IUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "用户同步管理")
@RequestMapping("/user/sync")
public class UserController {

    private final IUserService userService;


    /**
     * 同步添加用户
     *
     * @param dto 用户同步参数
     * @return 响应结果
     */
    @Inner(value = false)
    @PostMapping("/add")
    @SysLog(value = "同步添加用户")
    @Operation(summary = "同步添加用户")
    public R<?> addUser(@RequestBody @Valid UserSyncDTO dto) {
        return userService.addUser(dto);
    }


    /**
     * 同步更新用户
     *
     * @param dto 用户同步参数
     * @return 响应结果
     */
    @PostMapping("/update")
    @Operation(summary = "同步更新用户")
    @SysLog(value = "同步更新用户")
    public R<?> updateUser(@RequestBody @Valid UserSyncDTO dto) {
        return userService.updateUser(dto);
    }



    @PostMapping("/delete")
    @Operation(summary = "同步删除用户")
    @SysLog(value = "同步删除用户")
    public R<?> deleteUser(@RequestBody @Valid Long[] ids) {
        return userService.deleteUser(ids);
    }


}