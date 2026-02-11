FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms128m -Xmx256m -Djava.security.egd=file:/dev/./urandom"

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-report-platform

WORKDIR /poco-report-platform

EXPOSE 9095

ADD ./target/poco-report-platform.jar ./

CMD sleep 180;java $JAVA_OPTS -jar poco-report-platform.jar
