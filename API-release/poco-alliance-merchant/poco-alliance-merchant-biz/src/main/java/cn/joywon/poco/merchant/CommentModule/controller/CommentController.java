package cn.joywon.poco.merchant.CommentModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.CommentModule.dto.CommentPublishDTO;
import cn.joywon.poco.merchant.CommentModule.dto.ProductCommentPageDTO;
import cn.joywon.poco.merchant.CommentModule.entity.ProductComment;
import cn.joywon.poco.merchant.CommentModule.service.ProductCommentService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

/**
 * 评价管理控制器
 *
 * @author poco
 * @date 2025-12-03
 */
@RestController
@AllArgsConstructor
@RequestMapping("/comment")
@Tag(name = "评价管理", description = "评价管理相关接口")
@Slf4j
public class CommentController {

    private final ProductCommentService productCommentService;

    // ==================== 消费者端接口 ====================

    /**
     * 发布评价（消费者）
     */
    @PostMapping("/consumer/publish")
    @Operation(summary = "发布评价", description = "消费者发布订单评价（包含商品评价和服务评价）")
    @SysLog("发布评价")
    public R<Boolean> publishComment(@Valid @RequestBody CommentPublishDTO dto) {
        log.info("发布评价请求: {}", dto);
        return productCommentService.publishComment(dto);
    }

    /**
     * 分页查询商品评价（消费者）
     */
    @PostMapping("/consumer/product/page")
    @Operation(summary = "分页查询商品评价", description = "C端商品详情页查询评价")
    public R<IPage<ProductComment>> pageProductComments(@Valid @RequestBody ProductCommentPageDTO dto) {
        return productCommentService.pageProductComments(dto);
    }

    // ==================== 商家后台接口 ====================

    @PostMapping("/merchant/page")
    @Operation(summary = "分页查询评价列表", description = "商家后台查询评价列表")
    @HasPermission("merchant_comment_view")
    public R<IPage<ProductComment>> pageMerchantComments(
            @Parameter(description = "分页参数") @RequestBody ProductCommentPageDTO dto) {
        return productCommentService.pageMerchantComments(dto);
    }

    /**
     * 商家回复评价
     */
    @PostMapping("/merchant/reply")
    @Operation(summary = "商家回复评价", description = "商家回复用户评价")
    @SysLog("商家回复评价")
    @HasPermission("merchant_comment_reply")
    public R<Boolean> replyComment(
            @Parameter(description = "评价ID") @RequestParam("commentId") Long commentId,
            @Parameter(description = "回复内容") @RequestParam("content") String content) {
        return productCommentService.replyComment(commentId, content);
    }

    /**
     * 更新显示状态（商家后台）
     */
    @PostMapping("/merchant/show")
    @Operation(summary = "更新显示状态", description = "商家隐藏/显示评价")
    @SysLog("更新显示状态")
    @HasPermission("merchant_comment_update")
    public R<Boolean> updateShowStatus(
            @Parameter(description = "评价ID") @RequestParam("commentId") Long commentId,
            @Parameter(description = "是否显示 (1-显示 0-隐藏)") @RequestParam("isShow") Integer isShow) {
        return productCommentService.updateShowStatus(commentId, isShow);
    }
}
