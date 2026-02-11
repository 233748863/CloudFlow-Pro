package cn.joywon.poco.user.api.dto;

import cn.joywon.poco.user.api.entity.AppUserAddress;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.io.Serial;
import java.io.Serializable;

@Data
@Schema(description = "APP用户地址传输对象")
@EqualsAndHashCode(callSuper = true)
public class AppUserAddressDTO extends AppUserAddress implements Serializable {
    @Serial
    private static final long serialVersionUID = 4265522602598575367L;
}
