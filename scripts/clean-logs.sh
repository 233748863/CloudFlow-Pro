#!/bin/sh
set -eu

# 术语 = Docker json-file 日志，具体含义：Docker 守护进程写入 /var/lib/docker/containers/*/*-json.log 的容器标准输出日志文件。
find /var/lib/docker/containers -type f -name '*-json.log' -mtime +7 -print -delete
echo "Old container logs cleaned"
