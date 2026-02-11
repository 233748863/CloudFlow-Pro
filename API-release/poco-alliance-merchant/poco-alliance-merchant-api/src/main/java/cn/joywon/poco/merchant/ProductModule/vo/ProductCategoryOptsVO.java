package cn.joywon.poco.merchant.ProductModule.vo;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
public class ProductCategoryOptsVO implements Serializable {
    @Serial
    private static final long serialVersionUID = -218049525608698303L;
   
    private Long id;

    private String name;

    private Long parentId;
}
