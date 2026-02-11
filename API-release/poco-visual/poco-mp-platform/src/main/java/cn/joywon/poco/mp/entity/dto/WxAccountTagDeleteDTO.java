package cn.joywon.poco.mp.entity.dto;

import lombok.Data;

import java.util.List;

@Data
public class WxAccountTagDeleteDTO {

	private List<Long> ids;

	private String wxAccountAppid;

}
