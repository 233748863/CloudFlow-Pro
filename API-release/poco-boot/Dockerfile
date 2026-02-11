FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

WORKDIR /poco-boot

ARG JAR_FILE=target/poco-boot.jar

COPY ${JAR_FILE} app.jar

EXPOSE 9999

ENV TZ=Asia/Shanghai JAVA_OPTS="-Djava.security.egd=file:/dev/./urandom"

CMD sleep 30; java $JAVA_OPTS -jar app.jar
