FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

WORKDIR /poco-register

ENV TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    JAVA_OPTS="-Xms512m -Xmx1024m -Djava.security.egd=file:/dev/./urandom"

ARG JAR_FILE=target/poco-register.jar

COPY ${JAR_FILE} /poco-register/app.jar

EXPOSE 8848 9848

CMD sleep 30; java $JAVA_OPTS -jar app.jar
