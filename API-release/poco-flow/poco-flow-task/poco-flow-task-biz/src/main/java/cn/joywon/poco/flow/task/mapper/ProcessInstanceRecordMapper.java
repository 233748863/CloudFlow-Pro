package cn.joywon.poco.flow.task.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import cn.joywon.poco.flow.task.entity.ProcessInstanceRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * <p>
 * 流程记录 Mapper 接口
 * </p>
 *
 * @author Vincent
 * @since 2023-05-07
 */
@Mapper
public interface ProcessInstanceRecordMapper extends BaseMapper<ProcessInstanceRecord> {

}
