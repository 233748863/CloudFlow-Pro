FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

MAINTAINER wangiegie@gmail.com

ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
ENV JAVA_OPTS="-Xms128m -Xmx256m -Djava.security.egd=file:/dev/./urandom -Dhttps.protocols=TLSv1.2,TLSv1.3 -Djdk.tls.client.protocols=TLSv1.2,TLSv1.3"

# 修复 SSL/TLS 密码套件问题 - 移除对 3DES 等算法的禁用
RUN sed -i 's/3DES_EDE_CBC, //g' /usr/lib/jvm/java-17-openjdk/conf/security/java.security && \
    sed -i 's/, 3DES_EDE_CBC//g' /usr/lib/jvm/java-17-openjdk/conf/security/java.security

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /poco-pay-platform

WORKDIR /poco-pay-platform

EXPOSE 5010

ADD ./target/poco-pay-platform.jar ./

CMD sleep 180;java $JAVA_OPTS -jar poco-pay-platform.jar
