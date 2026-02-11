package cn.joywon.poco.merchant.MarketingModule.service.impl;

import cn.joywon.poco.merchant.MarketingModule.entity.PointsMallCart;
import cn.joywon.poco.merchant.MarketingModule.mapper.PointsMallCartMapper;
import cn.joywon.poco.merchant.MarketingModule.service.IPointsMallCartService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class PointsMallCartServiceImpl extends
        ServiceImpl<PointsMallCartMapper, PointsMallCart> implements IPointsMallCartService {
}