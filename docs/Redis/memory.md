## **1. 缓存策略**
### **1.1 内存使用分析**
Redis 是内存数据库，所有数据都存储在内存中。了解内存使用情况是优化的第一步。

```properties
INFO memory
```

关键指标：

| **指标** | **说明** |
| --- | --- |
| `used_memory` | Redis 实际使用的内存量（不含碎片） |
| `used_memory_rss` | 操作系统分配给 Redis 的物理内存（含碎片） |
| `mem_fragmentation_ratio` | 内存碎片率 = `used_memory_rss / used_memory` |
| `used_memory_peak` | 历史峰值内存使用 |


### **1.2 Redis 缓存过期策略**
数据不是永久存在的，我们可以通过 EXPIRE 设置 TTL。

两种过期策略：

| **策略** | **说明** |
| --- | --- |
| **惰性过期（Lazy Expiration）** | 访问 key 时才检查是否过期，过期则删除 |
| **定期过期（Active Expiration）** | Redis 每秒 10 次随机抽查部分带 TTL 的 key，删除已过期的 |


实际是 惰性 + 定期 两种策略结合，保证性能与内存回收的平衡

### **1.3 Redis 缓存淘汰策略**
当内存达到上限（maxmemory 设置），Redis 必须淘汰一些 key 来腾出空间。

#### 🎯设置最大内存
```java
-- 在客户端执行这个命令可以设置缓存，如果不设置其实是0，代表对内存大小没有限制
CONFIG SET maxmemory 4gb
--也可以在conf文件中设置命令，这样每次启动服务，内存大小都是这个
maxmemory 4gb
```

#### 🎯设置淘汰策略
```properties
maxmemory-policy volatile-lru
```

#### 🎯Redis 提供了 8 种淘汰策略
1. noeviction：不对数据进行淘汰，默认就是这个策略，一旦缓存被写满了，再有写请求来时，Redis 不再提供服务，而是直接返回错误。Redis 用作缓存时，实际的数据集通常都是大于缓存容量的，总会有新的数据要写入缓存，这个策略本身不淘汰数据，也就不会腾出新的缓存空间，我们不把它用在 Redis 缓存中。
2. volatile-ttl 在筛选时，会针对设置了过期时间的键值对，根据过期时间的先后进行删除，越早过期的越先被删除。
3. volatile-random 在设置了过期时间的键值对中，进行随机删除。
4. volatile-lru 会使用 LRU 算法筛选设置了过期时间的键值对。
5. volatile-lfu 会使用 LFU 算法选择设置了过期时间的键值对。
6. allkeys-random 策略，从所有键值对中随机选择并删除数据；
7. allkeys-lru 策略，使用 LRU 算法在所有数据中进行筛选。
8. allkeys-lfu 策略，使用 LFU 算法在所有数据中进行筛选。

**生产环境推荐：**

+ 缓存场景：allkeys-lru 或 allkeys-lfu
+ 混合场景：volatile-lru
+ 防止数据丢失：noeviction + 监控告警

#### 🎯LRU算法和LFU算法
LRU（Least Recently Used）：基于“最近访问时间”淘汰。如果一个 key 很久没访问，即使它访问频率高，也会被淘汰。

+ 优点：实现简单，适合访问局部性强的场景
+ 缺点：对突发访问敏感（如爬虫刷一次就变成热点）

LFU（Least Frequently Used）：基于“访问频率”淘汰。记录每个 key 的访问次数，淘汰访问最少的。

+ 优点：更精准识别“真热点”
+ 实现：Redis 使用 24-bit 计数器 + 衰减机制（避免旧数据长期占优）
+ 适用：长期热点数据场景（如用户画像）



在 Redis 中，为了在性能和淘汰精度之间取得平衡，LRU 算法被简化为“近似 LRU”（Approximate LRU），避免维护全局链表带来的性能开销。

Redis 为每个对象（redisObject）设置了一个 lru 字段，记录该对象最后一次被访问的时间戳（单位是秒或分钟，取决于 LRU_CLOCK_RESOLUTION）。

当内存达到 maxmemory 限制需要淘汰数据时，Redis 不会扫描所有 key，而是从当前所有 key 中随机抽取 N 个样本（N 由 maxmemory-samples 配置，默认为 5）。Redis 比较这 N 个样本的 lru 字段，找出其中值最小（即访问时间最久远）的 key，并将其淘汰。

每次淘汰都是独立过程：下一次淘汰时，Redis 会重新随机抽取 maxmemory-samples 个新样本，再次比较并淘汰最久未访问者。不存在“复用上一次候选集合”的机制。

非精确 LRU，但通过增加 maxmemory-samples（如设为 10）可提高精度

```java
CONFIG SET maxmemory-samples 100
```



LFU 策略中会从两个维度来筛选并淘汰数据：一是，数据访问的时效性（访问时间离当前时间的远近）；二是，数据的被访问次数。LFU 缓存策略是在 LRU 策略基础上，为每个数据增加了一个计数器，来统计这个数据的访问次数。当使用 LFU 策略筛选淘汰数据时，首先会根据数据的访问次数进行筛选，把访问次数最低的数据淘汰出缓存。如果两个数据的访问次数相同，LFU 策略再比较这两个数据的访问时效性，把距离上一次访问时间更久的数据淘汰出缓存。

### **1.4  如何优化 Redis 内存使用**
1. 键名压缩，如 user:1000:name → u:1000:n
2. Redis 本身不压缩，但可客户端压缩（如 gzip）
3. 非持久数据加过期时间
4. Redis 4.0+ 启用 activedefrag yes

### **1.5   Redis 的内存碎片怎么产生的？如何解决？**
内存碎片产生原因：

+ 频繁增删 key，导致内存分配器无法连续分配
+ 分配器（如 jemalloc）的内存对齐策略

解决方法：

+ 重启 Redis：最彻底（但有停机成本）
+ 启用主动碎片整理：

```properties
# 启用或禁用 Redis 的主动碎片整理机制。默认值：no
activedefrag yes

# 定义当 Redis 实际使用的物理内存 (used_memory_rss) 超出逻辑内存 (used_memory) 多少字节时才开始执行碎片整理。
active-defrag-ignore-bytes 100mb

# 当内存碎片率达到或超过 10% 时，Redis 就会开始尝试整理内存碎片。
active-defrag-threshold-lower 10

# 当 Redis 实际占用的物理内存超出逻辑内存 100MB 以上，并且内存碎片率达到了 10% 或更高时，Redis 将开始执行碎片整理操作。
```

+ 使用 LFU 替代 LRU：减少频繁淘汰带来的碎片，LFU 比 LRU 更能识别“真热点”，让高频 key 长期驻留内存，减少“短期 key 上位 → 被淘汰 → 产生内存空洞”的过程，从而降低内存分配的碎片化程度，提升内存使用效率。

### **1.6   策略使用建议**
1. 通用缓存场景（如 Session、页面缓存），推荐使用 allkeys-lru，因为这类场景下，所有 key 都是缓存数据，没有持久化要求，LRU 能很好地保留‘最近活跃’的数据，命中率高，实现简单，适合大多数 Web 应用。
2. 热点数据明显、长期稳定的场景（如用户画像、商品信息）。推荐使用 allkeys-lfu（Redis 4.0+）。LFU 基于访问频率淘汰，能更好识别‘真热点’，避免 LRU 对短期访问的误判。虽然 LFU 内存开销略大，但在热点集中的场景下，命中率显著高于 LRU。
3. 混合存储场景（既有缓存，也有持久数据），推荐使用 volatile-lru 或 volatile-lfu。我们会给缓存类 key 设置 TTL，而核心数据不设 TTL。这样淘汰策略只作用于带过期时间的 key，保护了持久化数据不被误删，兼顾灵活性与安全性。
4. 防止数据丢失的严格场景，可以使用 noeviction，并配合外部监控告警。这种策略下，内存满时 Redis 会拒绝写入，保证数据不丢失。适用于金融、交易类系统，但需要确保 maxmemory 设置合理，并有运维预案（如自动扩容）。

