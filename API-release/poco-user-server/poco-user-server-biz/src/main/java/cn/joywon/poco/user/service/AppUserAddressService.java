package cn.joywon.poco.user.service;

import cn.joywon.poco.user.api.dto.AppUserAddressDTO;
import cn.joywon.poco.user.api.entity.AppUserAddress;
import cn.joywon.poco.user.api.vo.AppUserAddressVO;
import com.baomidou.mybatisplus.extension.service.IService;
import jakarta.validation.Valid;

import java.util.List;

public interface AppUserAddressService extends IService<AppUserAddress> {
    List<AppUserAddressVO> listAddress(Long userId);

    void add(@Valid AppUserAddressDTO input);

    void edit(@Valid AppUserAddressDTO input);

    void setDefault(@Valid AppUserAddressDTO input, Long userId);

    void removeAddress(Long id, Long userId);

    AppUserAddressVO getDefault(Long userId);
}
