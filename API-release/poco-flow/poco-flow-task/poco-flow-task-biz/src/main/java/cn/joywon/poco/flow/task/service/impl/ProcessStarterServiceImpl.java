package cn.joywon.poco.flow.task.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.flow.task.entity.ProcessStarter;
import cn.joywon.poco.flow.task.mapper.ProcessStarterMapper;
import cn.joywon.poco.flow.task.service.IProcessStarterService;
import org.springframework.stereotype.Service;

/**
 * <p>
 * 流程发起人 服务实现类
 * </p>
 *
 * @author Vincent
 * @since 2023-05-30
 */
@Service
public class ProcessStarterServiceImpl extends ServiceImpl<ProcessStarterMapper, ProcessStarter>
		implements IProcessStarterService {

}
