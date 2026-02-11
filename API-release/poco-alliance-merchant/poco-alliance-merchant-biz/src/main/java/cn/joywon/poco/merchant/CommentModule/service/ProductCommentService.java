package cn.joywon.poco.merchant.CommentModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.CommentModule.dto.CommentPublishDTO;
import cn.joywon.poco.merchant.CommentModule.dto.ProductCommentPageDTO;
import cn.joywon.poco.merchant.CommentModule.entity.ProductComment;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;

/**
 * 商品评价服务接口
 *
 * @author poco
 * @date 2025-12-03
 */
public interface ProductCommentService extends IService<ProductComment> {

    /**
     * 发布评价
     * @param dto 评价发布DTO
     * @return 结果
     */
    R<Boolean> publishComment(CommentPublishDTO dto);

    /**
     * 分页查询商品评价 (C端)
     * @param dto 查询条件
     * @return 分页结果
     */
    R<IPage<ProductComment>> pageProductComments(ProductCommentPageDTO dto);

    /**
     * 分页查询商家评价 (B端)
     * @param dto 查询条件
     * @return 分页结果
     */
    R<IPage<ProductComment>> pageMerchantComments(ProductCommentPageDTO dto);

    /**
     * 商家回复评价
     * @param commentId 评价ID
     * @param content 回复内容
     * @return 结果
     */
    R<Boolean> replyComment(Long commentId, String content);

    /**
     * 更新显示状态
     * @param commentId 评价ID
     * @param isShow 是否显示
     * @return 结果
     */
    R<Boolean> updateShowStatus(Long commentId, Integer isShow);
}
