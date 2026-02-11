package cn.joywon.poco.merchant.Common.page;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 公共分页查询参数
 */
@Data
@Schema(description = "分页查询参数")
public class PageQueryDTO {

    @Schema(description = "页码", defaultValue = "1")
    private Long pageNum = 1L;

    @Schema(description = "每页大小", defaultValue = "10")
    private Long pageSize = 10L;

    public <T> Page<T> page() {
        return Page.of(pageNum, pageSize);
    }

}