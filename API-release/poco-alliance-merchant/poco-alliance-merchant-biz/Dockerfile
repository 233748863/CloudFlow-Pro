FROM registry.openanolis.cn/openanolis/openjdk:17-8.6

# 设置时区和语言环境
ENV TZ=Asia/Shanghai
ENV LANG C.UTF-8
# 配置Java堆内存参数
ENV JAVA_OPTS="-Xms512m -Xmx1024m -Djava.security.egd=file:/dev/./urandom"

# 设置时区
RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 创建并设置工作目录
RUN mkdir -p /ma-alliance-merchant
WORKDIR /ma-alliance-merchant

# 暴露端口
EXPOSE 9988

# 添加新模块的jar包（需根据实际jar包名称修改）
ADD ./target/poco-alliance-merchant-biz.jar ./

# 启动命令（增加60秒延迟以确保依赖服务启动完成）
CMD sleep 60;java $JAVA_OPTS -jar poco-alliance-merchant-biz.jar