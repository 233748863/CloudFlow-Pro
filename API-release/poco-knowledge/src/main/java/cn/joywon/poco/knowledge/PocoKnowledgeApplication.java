/*
 *
 *      Copyright (c) 2018-2025, poco All rights reserved.
 *
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 *  this list of conditions and the following disclaimer.
 *  Redistributions in binary form must reproduce the above copyright
 *  notice, this list of conditions and the following disclaimer in the
 *  documentation and/or other materials provided with the distribution.
 *  Neither the name of the pig4cloud.com developer nor the names of its
 *  contributors may be used to endorse or promote products derived from
 *  this software without specific prior written permission.
 *  Author: poco
 *
 */

package cn.joywon.poco.knowledge;

import cn.joywon.poco.common.security.annotation.EnablePocoResourceServer;
import cn.joywon.poco.common.swagger.annotation.EnableOpenApi;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * @author poco
 * @date 2024-04-19
 * <p>
 * AI 模块
 */
@EnableOpenApi("knowledge")
@EnablePocoResourceServer
@EnableDiscoveryClient
@SpringBootApplication
public class PocoKnowledgeApplication {

	public static void main(String[] args) {
		SpringApplication.run(PocoKnowledgeApplication.class, args);
	}

}
