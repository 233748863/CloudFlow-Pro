package cn.joywon.poco.merchant.ProductModule.dto;

import cn.joywon.poco.merchant.ProductModule.definition.ProductStatusEnum;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

@Data
public class ProductToggleStatusDTO implements Serializable {
    @Serial
    private static final long serialVersionUID = -3488967620819495927L;

    private List<Long> ids;

    private ProductStatusEnum status;
}
