package cn.joywon.poco.merchant.ProductModule.bo;

import cn.joywon.poco.merchant.ProductModule.vo.MiniProductHomeListVO;
import lombok.Data;

import java.util.List;

@Data
// 商家商品分组信息数据
public class MerchantProductGroupBO {

    // 商家ID
    private Long merchantId;

    // 商品分组列表
    private List<MiniProductHomeListVO> products;

}