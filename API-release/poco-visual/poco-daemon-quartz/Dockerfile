FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms128m -Xmx256m -Djava.security.egd=file:/dev/./urandom"

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-daemon-quartz

WORKDIR /poco-daemon-quartz

EXPOSE 5007

ADD ./target/poco-daemon-quartz.jar ./

CMD sleep 120;java $JAVA_OPTS -jar poco-daemon-quartz.jar
