package cn.joywon.poco.user.api.vo;

import cn.joywon.poco.user.api.entity.AppUserAddress;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.io.Serial;
import java.io.Serializable;

@Data
@Schema(description = "App用户地址数据展示对象")
@EqualsAndHashCode(callSuper = true)
public class AppUserAddressVO extends AppUserAddress implements Serializable {
    @Serial
    private static final long serialVersionUID = -3817983313484029346L;
}
