FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms512m -Xmx1024m -Djava.security.egd=file:/dev/./urandom"

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-user-server

WORKDIR /poco-user-server

EXPOSE 7061

ADD ./target/poco-user-server-biz.jar ./

CMD sleep 60;java $JAVA_OPTS -jar poco-user-server-biz.jar
