FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms128m -Xmx256m -Djava.security.egd=file:/dev/./urandom"

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-gateway

WORKDIR /poco-gateway

EXPOSE 9999

ADD ./target/poco-gateway.jar ./

CMD sleep 180;java $JAVA_OPTS -jar poco-gateway.jar
