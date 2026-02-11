package cn.joywon.poco.merchant.OrderModule.service.impl;

import cn.joywon.poco.merchant.OrderModule.entity.PointsMallOrder;
import cn.joywon.poco.merchant.OrderModule.mapper.PointsMallOrderMapper;
import cn.joywon.poco.merchant.OrderModule.service.IPointsMallOrderService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class PointsMallOrderServiceImpl extends
        ServiceImpl<PointsMallOrderMapper, PointsMallOrder> implements IPointsMallOrderService {
}