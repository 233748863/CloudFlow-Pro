package cn.joywon.poco.merchant.Common.page;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

@Data
@Schema(description = "游标查询返回数据")
public class CursorQueryVO<VO> implements Serializable {

    @Serial
    private static final long serialVersionUID = -5990414694111007491L;

    @Schema(description = "每页大小")
    private Integer size;

    @Schema(description = "总记录数")
    private Integer total;

    @Schema(description = "当前页码")
    private Integer pageNum;

    @Schema(description = "是否还有更多数据")
    private Boolean hasMore;

    @Schema(description = "下一页起始游标")
    private Integer nextCursor;

    @Schema(description = "数据列表")
    private List<VO> records;

}