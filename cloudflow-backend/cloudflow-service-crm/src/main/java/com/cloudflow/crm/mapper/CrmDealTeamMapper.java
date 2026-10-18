package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmDealTeam;
import java.util.List;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmDealTeamMapper extends BaseMapper<CrmDealTeam> {
    List<CrmDealTeam> lockCurrent(@Param("bizType") String bizType, @Param("bizId") Long bizId);
    List<Integer> lockVersions(@Param("bizType") String bizType, @Param("bizId") Long bizId);
    List<Integer> versions(@Param("bizType") String bizType, @Param("bizId") Long bizId);
    int retireCurrent(@Param("bizType") String bizType, @Param("bizId") Long bizId, @Param("version") int version,
            @Param("actor") String actor, @Param("now") LocalDateTime now);
    int updatePreview(@Param("bizType") String bizType, @Param("bizId") Long bizId, @Param("version") int version,
            @Param("userId") Long userId, @Param("amount") BigDecimal amount, @Param("commission") BigDecimal commission,
            @Param("actor") String actor, @Param("now") LocalDateTime now);
}
