package cn.joywon.poco.merchant.CommentModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.DataScopeFuncEnum;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.CommentModule.dto.CommentPublishDTO;
import cn.joywon.poco.merchant.CommentModule.dto.ProductCommentCreateDTO;
import cn.joywon.poco.merchant.CommentModule.dto.ProductCommentPageDTO;
import cn.joywon.poco.merchant.CommentModule.entity.ProductComment;
import cn.joywon.poco.merchant.CommentModule.entity.StoreServiceComment;
import cn.joywon.poco.merchant.CommentModule.mapper.ProductCommentMapper;
import cn.joywon.poco.merchant.CommentModule.service.ProductCommentService;
import cn.joywon.poco.merchant.CommentModule.service.StoreServiceCommentService;
import cn.joywon.poco.merchant.OrderModule.definition.OrderStatusEnum;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.entity.OrderItem;
import cn.joywon.poco.merchant.OrderModule.mapper.OrderItemMapper;
import cn.joywon.poco.merchant.OrderModule.service.OrderService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 商品评价服务实现类
 *
 * @author poco
 * @date 2025-12-03
 */
@Service
@AllArgsConstructor
public class ProductCommentServiceImpl extends ServiceImpl<ProductCommentMapper, ProductComment> implements ProductCommentService {

    private final OrderService orderService;
    private final OrderItemMapper orderItemMapper;
    private final StoreServiceCommentService storeServiceCommentService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> publishComment(CommentPublishDTO dto) {
        PocoUser user = SecurityUtils.getUser();
        if (user == null) {
            return R.failed("用户未登录");
        }

        // 1. 校验订单
        Order order = orderService.getById(dto.getOrderId());
        if (order == null) {
            return R.failed("订单不存在");
        }
        if (!user.getId().equals(order.getUserId())) {
            return R.failed("无权评价该订单");
        }
        if (!OrderStatusEnum.COMPLETED.getCode().equals(order.getStatus())) {
            return R.failed("订单未完成，无法评价");
        }

        // 2. 校验是否已评价 (检查是否已存在该订单的商品评价)
        Long count = this.baseMapper.selectCount(Wrappers.<ProductComment>lambdaQuery()
                .eq(ProductComment::getOrderId, order.getId()));
        if (count > 0) {
            return R.failed("该订单已评价，请勿重复评价");
        }

        // 3. 保存商品评价
        List<ProductCommentCreateDTO> commentDTOs = dto.getProductComments();
        if (CollUtil.isNotEmpty(commentDTOs)) {
            // 获取订单项信息
            List<OrderItem> orderItems = orderItemMapper.selectList(Wrappers.<OrderItem>lambdaQuery()
                    .eq(OrderItem::getOrderId, order.getId()));
            Map<Long, OrderItem> itemMap = orderItems.stream()
                    .collect(Collectors.toMap(OrderItem::getId, Function.identity()));

            List<ProductComment> comments = new ArrayList<>();
            for (ProductCommentCreateDTO commentDTO : commentDTOs) {
                OrderItem item = itemMap.get(commentDTO.getOrderItemId());
                if (item == null) {
                    return R.failed("订单项不存在或不属于该订单: " + commentDTO.getOrderItemId());
                }

                ProductComment comment = new ProductComment();
                comment.setAppUserId(user.getId());
                comment.setUserNickName(StrUtil.isNotBlank(user.getNickname()) ? user.getNickname() : user.getUsername());
                comment.setUserAvatar(user.getAvatar());
                comment.setMerchantId(order.getMerchantId());
                comment.setStoreId(order.getStoreId());
                comment.setOrderId(order.getId());
                comment.setOrderItemId(item.getId());
                comment.setProductId(item.getProductId());
                comment.setProductName(item.getProductName());
                comment.setSkuId(item.getProductSkuId());
                comment.setSkuSpec(item.getSkuName());
                comment.setStar(commentDTO.getStar());
                comment.setContent(commentDTO.getContent());
                comment.setImages(commentDTO.getImages());
                comment.setIsAnonymous(commentDTO.getIsAnonymous());
                comment.setIsShow(1); // 默认显示，或根据配置需审核
                
                comments.add(comment);
            }
            if (CollUtil.isNotEmpty(comments)) {
                this.saveBatch(comments);
            }
        }

        // 4. 保存店铺服务评价
        if (dto.getDeliveryStar() != null || dto.getServiceStar() != null) {
            StoreServiceComment serviceComment = new StoreServiceComment();
            serviceComment.setOrderId(order.getId());
            serviceComment.setMerchantId(order.getMerchantId());
            serviceComment.setStoreId(order.getStoreId());
            serviceComment.setAppUserId(user.getId());
            serviceComment.setDeliveryStar(dto.getDeliveryStar());
            serviceComment.setServiceStar(dto.getServiceStar());
            storeServiceCommentService.save(serviceComment);
        }

        return R.ok(true, "评价发布成功");
    }

    @Override
    public R<IPage<ProductComment>> pageProductComments(ProductCommentPageDTO dto) {
        IPage<ProductComment> page = dto.page();
        LambdaQueryWrapper<ProductComment> wrapper = Wrappers.<ProductComment>lambdaQuery()
                .eq(ProductComment::getProductId, dto.getProductId())
                .eq(ProductComment::getIsShow, 1); // 只查显示的

        if (dto.getStoreId() != null) {
            wrapper.eq(ProductComment::getStoreId, dto.getStoreId());
        }
        if (Boolean.TRUE.equals(dto.getHasImage())) {
            wrapper.isNotNull(ProductComment::getImages).ne(ProductComment::getImages, "[]").ne(ProductComment::getImages, "");
        }
        if (Boolean.TRUE.equals(dto.getIsGood())) {
            wrapper.ge(ProductComment::getStar, 4);
        }

        wrapper.orderByDesc(ProductComment::getCreatedTime);
        
        return R.ok(this.page(page, wrapper));
    }

    @Override
    public R<IPage<ProductComment>> pageMerchantComments(ProductCommentPageDTO dto) {
        // 构建 DataScope
        // storeId 有值则过滤 store_id，否则过滤 merchant_id
        String deptColumn = (dto.getStoreId() != null && dto.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope dataScope = listScope(deptColumn, "created_by");

        // 分页查询
        Page<ProductComment> page = dto.page();
        return R.ok(baseMapper.pageMerchantComments(page, dto, dataScope));
    }

    /**
     * 创建列表查询的 DataScope
     */
    private DataScope listScope(String deptColumn, String userColumn) {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    @Override
    public R<Boolean> replyComment(Long commentId, String content) {
        PocoUser user = SecurityUtils.getUser();
        if (user == null) {
            return R.failed("用户未登录");
        }
        
        ProductComment comment = this.getById(commentId);
        if (comment == null) {
            return R.failed("评价不存在");
        }
        
        // 校验权限 (简单校验是否为该商家的用户，实际应更严谨)
        // if (!user.getMerchantId().equals(comment.getMerchantId())) ...

        comment.setReplyContent(content);
        comment.setReplyTime(LocalDateTime.now());
        comment.setReplyUserId(user.getId());
        
        return R.ok(this.updateById(comment));
    }

    @Override
    public R<Boolean> updateShowStatus(Long commentId, Integer isShow) {
        ProductComment comment = new ProductComment();
        comment.setId(commentId);
        comment.setIsShow(isShow);
        return R.ok(this.updateById(comment));
    }
}
