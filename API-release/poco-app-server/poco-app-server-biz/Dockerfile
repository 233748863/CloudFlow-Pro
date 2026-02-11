FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms512m -Xmx1024m -Djava.security.egd=file:/dev/./urandom"

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-app-server

WORKDIR /poco-app-server

EXPOSE 7060

ADD ./target/poco-app-server-biz.jar ./

CMD sleep 60;java $JAVA_OPTS -jar poco-app-server-biz.jar
