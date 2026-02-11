package cn.joywon.poco.merchant.MarketingModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductCreateDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductOnOffShelfDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductUpdateDTO;
import cn.joywon.poco.merchant.MarketingModule.entity.PointsMallProduct;
import com.baomidou.mybatisplus.extension.service.IService;

public interface IPointsMallProductService extends IService<PointsMallProduct> {


    /**
     * 创建积分商城商品
     *
     * @param dto 积分商城商品创建参数
     * @return 操作结果
     */
    R<?> createProduct(PointsMallProductCreateDTO dto);


    /**
     * 删除积分商城商品
     *
     * @param id 商品ID
     * @return 操作结果
     */
    R<?> deleteProduct(String id);


    /**
     * 更新积分商城商品
     *
     * @param dto 积分商城商品更新参数
     * @return 操作结果
     */
    R<?> updateProduct(PointsMallProductUpdateDTO dto);


    /**
     * 发布积分商城商品
     *
     * @param dto 商品上/下架参数
     * @return 操作结果
     */
    R<?> onOffShelfProduct(PointsMallProductOnOffShelfDTO dto);


    /**
     * 积分商城商品上/下架(消息监听处理调用)
     *
     * @param productId 商品ID
     * @param onShelf   商品上/下架
     */
    boolean onOffShelfByMessage(String productId, boolean onShelf);


}