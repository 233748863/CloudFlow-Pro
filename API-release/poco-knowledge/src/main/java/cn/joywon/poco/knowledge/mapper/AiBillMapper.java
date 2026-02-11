package cn.joywon.poco.knowledge.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.knowledge.entity.AiBillEntity;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;
import java.util.Map;

@Mapper
public interface AiBillMapper extends PocoBaseMapper<AiBillEntity> {

	/**
	 * 查询账单汇总
	 * @return
	 */
	List<Map<String, Object>> selectBillSum();

}
