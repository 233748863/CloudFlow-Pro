FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms128m -Xmx256m -Djava.security.egd=file:/dev/./urandom"

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-xxl-job-admin

WORKDIR /poco-xxl-job-admin

EXPOSE 9080

ADD ./target/poco-xxl-job-admin.jar ./

CMD sleep 120;java $JAVA_OPTS -jar poco-xxl-job-admin.jar
