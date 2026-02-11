FROM registry.cn-hangzhou.aliyuncs.com/dockerhub_mirror/mysql-server:8.0.32

MAINTAINER poco(wangiegie@gmail.com)

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

COPY ./1schema.sql /docker-entrypoint-initdb.d

COPY ./2pocox.sql /docker-entrypoint-initdb.d

COPY ./3pocox_flow.sql /docker-entrypoint-initdb.d

COPY ./4pocox_job.sql /docker-entrypoint-initdb.d

COPY ./5pocox_mp.sql /docker-entrypoint-initdb.d

COPY ./6pocox_config.sql /docker-entrypoint-initdb.d

COPY ./7pocox_pay.sql /docker-entrypoint-initdb.d

COPY ./8pocox_codegen.sql /docker-entrypoint-initdb.d

COPY ./9pocox_ai.sql /docker-entrypoint-initdb.d

COPY ./99pocox_bi.sql /docker-entrypoint-initdb.d

COPY ./999pocox_app.sql /docker-entrypoint-initdb.d

COPY ./9999pocox_alliance.sql /docker-entrypoint-initdb.d
