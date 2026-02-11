FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms128m -Xmx256m -Djava.security.egd=file:/dev/./urandom"

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-daemon-elastic-job

WORKDIR /poco-daemon-elastic-job

EXPOSE 5002

ADD ./target/poco-daemon-elastic-job.jar ./

CMD sleep 120;java $JAVA_OPTS -jar poco-daemon-elastic-job.jar
