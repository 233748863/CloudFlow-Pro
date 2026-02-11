package cn.joywon.poco.merchant.Common.page;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import com.baomidou.mybatisplus.core.metadata.IPage;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;
import java.util.function.Function;

@Data
@Schema(description = "分页查询返回数据")
public class PageQueryVO<VO> implements Serializable {

    @Serial
    private static final long serialVersionUID = -56068651875956673L;

    @Schema(description = "当前页码")
    private Integer current;

    @Schema(description = "每页大小")
    private Integer size;

    @Schema(description = "总记录数")
    private Integer total;

    @Schema(description = "数据列表")
    private List<VO> records;

    public PageQueryVO(Long current, Long size, Long total, List<VO> records) {
        this.current = current.intValue();
        this.size = size.intValue();
        this.total = total.intValue();
        this.records = records;
    }

    /**
     * 处理分页查询结果为空时
     */
    public static <ENTITY, VO> PageQueryVO<VO> empty(IPage<ENTITY> page) {
        return new PageQueryVO<>(page.getCurrent(), page.getSize(), page.getTotal(), List.of());
    }

    /**
     * 处理分页查询结果
     */
    public static <VO> PageQueryVO<VO> of(IPage<VO> pageData) {
        List<VO> records = pageData.getRecords();
        if (CollUtil.isEmpty(records)) {
            return empty(pageData);
        }
        return new PageQueryVO<>(pageData.getCurrent(), pageData.getSize(), pageData.getTotal(), records);
    }

    /**
     * 处理分页查询结果并转换为VO列表
     */
    public static <ENTITY, VO> PageQueryVO<VO> of(IPage<ENTITY> pageData, Class<VO> voClass) {
        List<ENTITY> records = pageData.getRecords();
        if (CollUtil.isEmpty(records)) {
            return empty(pageData);
        }
        List<VO> vos = BeanUtil.copyToList(records, voClass);
        return new PageQueryVO<>(pageData.getCurrent(), pageData.getSize(), pageData.getTotal(), vos);
    }

    /**
     * 处理分页查询结果并转换为VO列表, 过程中使用转换函数进行转换
     */
    public static <ENTITY, VO> PageQueryVO<VO> of(IPage<ENTITY> pageData, Function<ENTITY, VO> convertor) {
        List<ENTITY> records = pageData.getRecords();
        if (CollUtil.isEmpty(records)) {
            return empty(pageData);
        }
        List<VO> vos = records.stream().map(convertor).toList();
        return new PageQueryVO<>(pageData.getCurrent(), pageData.getSize(), pageData.getTotal(), vos);
    }

}