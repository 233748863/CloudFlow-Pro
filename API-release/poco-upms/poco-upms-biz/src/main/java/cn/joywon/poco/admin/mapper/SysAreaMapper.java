package cn.joywon.poco.admin.mapper;

import cn.joywon.poco.admin.api.entity.SysAreaEntity;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface SysAreaMapper extends PocoBaseMapper<SysAreaEntity> {


    /**
     * 根据adCode获取地区名称
     *
     * @param adCode adCode
     * @return 地区名称
     */
    String getLocationByCode(Long adCode);


    /**
     * 根据城市名称获取adCode
     *
     * @param name 地区名称
     * @return adCode
     */
    Long getCodeByLocation(String name);


    /**
     * 根据adCodes列表获取地区名称列表
     *
     * @param adCodes adCodes列表
     * @return 地区名称列表
     */
    List<String> getLocationsByCodes(List<Long> adCodes);


}