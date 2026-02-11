package cn.joywon.poco.merchant.MemberModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
@Schema(description = "用户同步新增参数")
public class UserSyncDTO {

    @NotNull(message = "`app_user`表ID不能为空")
    @Schema(description = "`app_user`表ID")
    private Long userId;

    @NotBlank(message = "微信openID不能为空")
    @Schema(description = "微信openID")
    private String wxOpenid;

    @Schema(description = "用户昵称")
    private String nickname;

    @Schema(description = "用户头像URL")
    private String avatar;

    @Schema(description = "用户手机号")
    private String phone;

    @Schema(description = "用户性别: 0-未知; 1-男; 2-女")
    private Integer gender;

    @Schema(description = "生日")
    private LocalDate birthday;

    @Schema(description = "城市编码")
    private Long cityCode;

    @Schema(description = "省份编码")
    private Long provinceCode;

    @Schema(description = "邀请注册的用户ID(`app_user`.id)")
    private Long inviterId;

}