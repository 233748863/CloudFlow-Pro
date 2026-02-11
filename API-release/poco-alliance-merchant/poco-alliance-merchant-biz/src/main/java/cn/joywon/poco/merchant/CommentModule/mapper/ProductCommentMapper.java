package cn.joywon.poco.merchant.CommentModule.mapper;

import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.CommentModule.dto.ProductCommentPageDTO;
import cn.joywon.poco.merchant.CommentModule.entity.ProductComment;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 商品评价 Mapper 接口
 *
 * @author poco
 * @date 2025-12-03
 */
@Mapper
public interface ProductCommentMapper extends PocoBaseMapper<ProductComment> {

    /**
     * 分页查询商家评价
     *
     * @param page      分页参数
     * @param dto       查询参数
     * @param dataScope 数据权限
     * @return 分页结果
     */
    IPage<ProductComment> pageMerchantComments(Page<ProductComment> page, @Param("dto") ProductCommentPageDTO dto, @Param("dataScope") DataScope dataScope);
}
