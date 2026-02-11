FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms512m -Xmx1024m -Djava.security.egd=file:/dev/./urandom"

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-flow-task

WORKDIR /poco-flow-task

EXPOSE 9030

ADD ./target/poco-flow-task-biz.jar ./

CMD sleep 60;java $JAVA_OPTS -jar poco-flow-task-biz.jar
