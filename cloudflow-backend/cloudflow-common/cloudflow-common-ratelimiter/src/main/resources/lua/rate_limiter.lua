-- 滑动窗口限流 Lua 脚本
-- KEYS[1]: 限流 Key
-- ARGV[1]: 最大请求次数
-- ARGV[2]: 时间窗口（秒）

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = tonumber(redis.call('get', key) or "0")

if current + 1 > limit then
    return 0
else
    redis.call('incrby', key, 1)
    if current == 0 then
        redis.call('expire', key, window)
    end
    return 1
end
