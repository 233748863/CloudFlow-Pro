package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaBudgetLine;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;

@Mapper
public interface OaBudgetLineMapper extends BaseMapper<OaBudgetLine> {

    int reserveAmount(@Param("lineId") Long lineId, @Param("amount") BigDecimal amount);

    int releaseAmount(@Param("lineId") Long lineId, @Param("amount") BigDecimal amount);

    int writeoffAmount(@Param("lineId") Long lineId, @Param("amount") BigDecimal amount);

    int adjustAmount(@Param("lineId") Long lineId, @Param("amount") BigDecimal amount);
}
