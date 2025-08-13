## **1. 深度解析RocketMQ**
### **1.1 读队列与写队列**
#### 🎯概念
我们可以在RocketMQ的管理控制台查看一个Topic的信息，其中就有写队列数量和读队列数量，还有Topic权限，perm字段表示Topic的权限。有三个可选项：

+ 2：禁写禁订阅
+ 4：可订阅，不能写
+ 6：可写可订阅

写队列会真实的创建对应的存储文件，负责消息写入。

而读队列会记录Consumer的Offset，负责消息读取。

#### 🎯读队列==写队列
在往写队列里写Message时，会同步写入到一个对应的读队列中。通常在运行时，需要设置读队列==写队列。

![](https://cdn.nlark.com/yuque/0/2024/png/32520881/1717210589447-076f4acf-115e-4061-9b1c-305599218d38.png)

1. 如果写队列大于读队列，就会有一部分写队列无法写入到读队列中，这一部分的消息就无法被读取，就会造成消息丢失。消息存入了，但是读不出来。所以读队列起码要大于等于写队列，避免有消息一直读不出来。
2. 而如果反过来，写队列小于读队列，那就有一部分读队列里是没有消息写入的。如果有一个消费者被分配的是这些没有消息的读队列，那这些消费者就无法消费消息，造成消费者空转，极大的浪费性能。
3. 只有一种情况下可以考虑将读写队列设置为不一致，就是要对Topic的MessageQueue进行缩减的时候。例如原来四个队列，现在要缩减成两个队列。如果立即缩减读写队列，那么被缩减的MessageQueue上没有被消费的消息，就会丢失。这时，可以先缩减写队列，待空出来的读队列上的消息都被消费完了之后，再来缩减读队列，这样就可以比较平稳的实现队列缩减了。

### **1.2 消息持久化**
#### 🎯CommitLog
**📌**** 核心作用**

+ 存储所有 Topic 的所有消息实体（即消息完整内容）。
+ 所有生产者发送的消息，无论属于哪个 Topic 或 Queue，都按到达顺序追加写入到 CommitLog 文件中。

**📦**** 文件结构**

+ 文件集合：由多个固定大小的文件组成，每个文件 1GB（默认）。
+ 文件命名：以该文件中第一条消息的全局物理偏移量（Physical Offset） 命名。
+ 例如：`00000000000000000000`、`00000000001073741824`（1GB 后）
+ 文件路径：`$HOME/store/commitlog/`

**✅**** 设计优势**

+ 极致写入性能，所有消息顺序追加写，避免随机 I/O，充分发挥磁盘吞吐能力（可达百万 IOPS）
+ 减少文件寻址开销，无需像 Kafka 那样为每个 Topic/Partition 单独寻址文件，特别适合 海量 Topic 场景

**⚙️**** 写入机制**

+ 消息先写入 Page Cache（通过 MappedByteBuffer 内存映射，实现零拷贝）。
+ Broker 后台线程（FlushCommitLogService）定期或同步调用 fsync 刷盘，确保持久化。
+ 过期文件删除：Broker 后台任务定期检查并删除过期文件（默认保留 72 小时）。

#### 🎯ConsumeQueue
**📌**** 核心作用**

+ 为每个 MessageQueue 构建消费索引，加速消费者拉取消息。
+ 它不存储消息内容，只记录消息在 CommitLog 中的物理位置。

**📦**** 文件结构**

+ 目录结构：$HOME/store/consumequeue/{topic}/{queueId}/
    - 每个 Topic 一个文件夹
    - 每个 QueueId 一个子文件夹
+ 文件大小：每个文件固定 6MB，可存储约 30 万条索引。
+ 文件命名：同样以第一条索引的逻辑偏移量（Logic Offset） 命名。
+ 每条索引大小：20 字节，包含：

```c
struct {
    long commitLogOffset;    // 消息在 CommitLog 中的物理偏移量
    int size;                // 消息总长度
    long tagsCode;           // Tag 的哈希值（用于服务端过滤）
}
```

**✅**** 工作流程**

+ 消费者向 Broker 拉取消息（指定 Topic + QueueId + 消费偏移量）。
+ Broker 根据 QueueId 定位到对应的 ConsumeQueue 文件。
+ 读取索引条目，获取消息在 CommitLog 中的 commitLogOffset。
+ 从 CommitLog 中读取完整消息内容，返回给消费者。

**📁**** 消费进度**

+ 消费者在每个 Queue 上的消费进度（即已消费到的逻辑偏移量），存储在：
    - 集群模式（CLUSTERING）：由 Broker 持久化到 config/consumerOffset.json，并定期同步到磁盘
+ Broker 启动时会加载该文件，恢复消费进度。

#### 🎯IndexFile
**📌**** 根本作用**

+ 支持通过 Message Key 或 Message ID 快速查询消息。
+ 用于 RocketMQ 控制台的 消息轨迹、消息查询、问题排查等运维功能。

**📦**** 文件结构**

+ 文件路径：$HOME/store/index/{fileName}
+ 文件命名：以 创建时的时间戳 命名（如 20250812203000000），便于按时间范围查询。
+ 文件大小：固定 400MB。
+ 内部结构：哈希索引结构，包含：
    - Header：索引元数据（条目数、时间范围等）
    - Hash Slot 数组：500万个槽位，用于哈希寻址
    - Index 条目数组：2000万个条目，每个 20 字节，结构如下：

```c
struct {
    int keyHash;           // Message Key 的哈希值
    long phyOffset;        // 消息在 CommitLog 中的物理偏移量
    int timeDiff;          // 相对于 IndexFile 创建时间的时间差
    int prevIndex;         // 哈希冲突链的前一个索引（拉链法）
}
```

**✅**** 工作流程（以 getMessageByKey 为例）**

+ 计算 key 的哈希值，定位到 Hash Slot。
+ 遍历该 Slot 对应的 Index 条目链。
+ 比对 keyHash 和 key（防哈希冲突），找到匹配条目。
+ 通过 phyOffset 从 CommitLog 读取消息。

### **1.3 零拷贝技术加速文件读写**
#### 🎯传统的数据传输
在传统的基于 read() + write() 的数据传输模型中，比如文件内容通过网络发送给客户端，整个过程涉及 四次上下文切换 和 四次数据拷贝，存在显著的性能开销。

+ 读取文件到内核空间，调用 read()，触发用户态 → 内核态切换。DMA 将磁盘数据加载至 内核缓冲区（如 PageCache）。
    - 第一次上下文切换，第一次数据拷贝磁盘 → 内核缓冲区（DMA）
+ CPU 将内核缓冲区数据拷贝到 用户缓冲区。read() 返回，触发内核态 → 用户态切换。
    - 第二次上下文切换，内核缓冲区 → 用户缓冲区（CPU）
+ 应用程序可对数据做处理（如加协议头、解码等）。此阶段无系统调用，仍在用户态。
+ 写入网络套接字，调用 write()，用户态 → 内核态切换。CPU 将用户缓冲区数据拷贝到 Socket 缓冲区。
    - 第三次上下文切换，用户缓冲区 → Socket 缓冲区（CPU）
+ DMA 将数据从 Socket 缓冲区传至 网卡。write() 返回，内核态 → 用户态切换。
    - 第四次上下文切换，Socket 缓冲区 → 网卡（DMA）

#### 🎯初识零拷贝
零拷贝是操作系统层面提供的一种加速文件读写的操作机制，对于Java应用层，对应着mmap和sendFile两种方式。操作系统对于内存空间，是分为用户态和内核态的。用户态的应用程序无法直接操作硬件，需要通过内核空间进行操作转换，才能真正操作硬件。这其实是为了保护操作系统的安全。正因为如此，应用程序需要与网卡、磁盘等硬件进行数据交互时，就需要在用户态和内核态之间来回的复制数据。

![](https://cdn.nlark.com/yuque/0/2024/png/32520881/1717567369122-0c086d6c-6151-4436-b9ae-eb3c062ddf0c.png)

1. 在这个操作中，总共需要进行四次数据拷贝
2. 磁盘和内核态之间的数据拷贝，在操作系统层面已经由CPU拷贝优化成DMA拷贝了
3. 所以零拷贝优化的重点，就是内核态和用户态之间的两次拷贝。

#### 🎯mmap文件映射机制
1. mmap() 系统调用将文件的一部分或全部映射到进程的虚拟地址空间，形成一个可读写的内存映射区域（Memory Mapping）。
2. 映射建立后，进程可像访问普通内存一样读写文件内容，无需显式调用 read() 或 write() 系统调用。对映射区域的访问会触发缺页中断（Page Fault），内核自动将文件对应的数据页从磁盘加载到 PageCache 中，并映射到进程的虚拟内存。
3. 写操作的语义取决于映射类型：
    1. 若为 共享映射（MAP_SHARED）：对内存的修改会反映到 PageCache，并由内核后台线程（如 pdflush）异步刷回磁盘；
    2. 若为 私有映射（MAP_PRIVATE）：写时复制（Copy-on-Write），不修改原始文件。
    3. RocketMQ 使用 MAP_SHARED，确保消息写入能最终持久化。
4. RocketMQ 将 CommitLog 文件固定为 1GB，正是为了适配 mmap 的最佳实践，1GB 是性能与管理的平衡点：足够大以支持高吞吐顺序写，又足够小以降低映射开销；单个文件大小小于 2GB，确保可被完整映射，避免跨文件寻址复杂性。

#### 🎯mmap在Java中的实现
在 Java 中，mmap 功能由 java.nio.channels.FileChannel#map() 方法提供，其底层封装了操作系统的 mmap() 系统调用，允许将文件直接映射到进程的虚拟地址空间，实现高效的文件访问。

**FileChannel.map() 返回的是 MappedByteBuffer**

```c
RandomAccessFile raf = new RandomAccessFile("data.log", "rw");
FileChannel channel = raf.getChannel();

// 将文件的 0~1GB 映射到内存
MappedByteBuffer buffer = channel.map(FileChannel.MapMode.READ_WRITE, 0, 1024 * 1024 * 1024);
```

+ map() 方法返回一个 MappedByteBuffer 实例；
+ 该实例不是普通堆内存对象，而是 JVM 堆外的一块内存映射区域；
+ 对它的读写会直接反映到文件内容（如果是 MAP_SHARED 模式）。

**MappedByteBuffer 与 DirectByteBuffer 的关系**

| **维度** | **PageCache** | **堆外内存（Direct Memory）** |
| --- | --- | --- |
| **管理者** | 操作系统内核 | 用户进程（JVM） |
| **分配方式** | `mmap(文件)`/ `read`触发 | `malloc`/ `mmap(MAP_ANONYMOUS)` |
| **是否关联文件** | ✅ 是 | ❌ 否（除非你写文件） |
| **内存类型** | 文件缓存页 | 普通物理内存 |
| **能否被回收** | ✅ 是（LRU 回收） | ❌ 不能被内核主动回收，只能由进程释放 |
| **零拷贝支持** | ✅ 支持（`sendfile`, `splice`） | ❌ 不直接支持，除非写入文件后再映射 |
| **典型应用** | `MappedByteBuffer`, Kafka, RocketMQ | `DirectByteBuffer`, Netty 缓冲区 |


+ DirectByteBuffer，Java NIO 提供的通用堆外内存缓冲区，通过 ByteBuffer.allocateDirect() 创建，内存来自 JVM 管理的堆外空间（Direct Memory）
+ MappedByteBuffer，DirectByteBuffer 的子类或特殊实现，由 FileChannel.map() 创建，其内存直接关联一个文件区域，是 mmap 的 Java 封装
+ MappedByteBuffer 本质上是一种特殊的 DirectByteBuffer；它的内存不是“分配”的，而是“映射”的。

**MappedByteBuffer 的底层实现机制**

+ MappedByteBuffer 不存储数据本身，它只维护一个内存地址指针（address 字段）；
+ 所有读写操作（如 put()、get()）都通过 Unsafe 类的底层方法直接访问该地址：

```c
unsafe.putByte(address + offset, value);
```

+ 这些访问会触发 缺页中断（Page Fault），由操作系统将文件对应的数据页加载到 PageCache，并建立虚拟内存到物理页的映射；
+ 写操作修改的是 PageCache 中的数据，由内核异步刷回磁盘。

#### 🎯Java的堆外内存和堆内存
**✅**** 场景一：使用 堆内内存（HeapByteBuffer）**

```properties
JVM 堆内存（byte[]）
        ↓
【JVM 内部拷贝】 → 一个临时的堆外缓冲区（Native Memory）
                        ↓
                【系统调用】write(fd, ptr, len)
                        ↓
               内核 Socket 缓冲区（TCP send buffer）
                        ↓
                      网卡
```

+ JVM 在 native 层必须先将 byte[] 拷贝到一个堆外的临时缓冲区（因为操作系统不能直接访问 JVM 堆）；
+ 然后调用 write()，把这块堆外缓冲区的数据 拷贝到 socket buffer；
+ 总共一次数据拷贝（发生在 JVM 内部） + 一次系统调用内的拷贝。

**✅**** 场景二：使用 堆外内存（DirectByteBuffer）**

```properties
堆外内存（DirectByteBuffer）
        ↓
【系统调用】write(fd, address, len)  // 直接传地址
        ↓
内核 Socket 缓冲区（TCP send buffer）
        ↓
      网卡
```

+ DirectByteBuffer 的内存本身就是堆外的（通过 malloc 或 mmap 分配）；
+ JVM 直接把这块内存的地址传给 write() 系统调用；
+ 内核从这个地址把数据 拷贝到 socket buffer；
+ 没有 JVM 内部的额外拷贝，只有一次系统调用内的拷贝。

#### 🎯sendFile机制
在sendFile机制中，数据的传输主要发生在内核态，减少了用户态的参与。具体来说，sendFile允许在内核空间内直接将数据从文件系统传输到网络套接字，避免了数据拷贝到用户空间的需要。sendFile机制非常适合于大文件传输和网络服务器中的静态文件发送等场景。在这些场景中，文件数据的快速传输和高效处理是至关重要的。

```java
public class TraditionalFileCopy {
    public static void copyFile(String sourceFile, String destFile) throws IOException {
        try (FileInputStream in = new FileInputStream(sourceFile);
             FileOutputStream out = new FileOutputStream(destFile)) {
            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
        }
    }

    //Traditional Copy Time: 1569 ms
    public static void main(String[] args) throws IOException {
        long startTime = System.currentTimeMillis();
        copyFile("D:\\1.log", "D:\\2.log");
        long endTime = System.currentTimeMillis();
        System.out.println("Traditional Copy Time: " + (endTime - startTime) + " ms");
    }
}
```

```java
public class ZeroCopyFileCopy {
    public static void copyFile(String sourceFile, String destFile) throws IOException {
        try (RandomAccessFile source = new RandomAccessFile(sourceFile, "r");
             RandomAccessFile dest = new RandomAccessFile(destFile, "rw");
             FileChannel sourceChannel = source.getChannel();
             FileChannel destChannel = dest.getChannel()) {

            long size = sourceChannel.size();
            long position = 0;
            while (position < size) {
                position += destChannel.transferFrom(sourceChannel, position, size - position);
            }
        }
    }

    //Zero Copy (via transferTo) Time: 677 ms
    public static void main(String[] args) throws IOException {
        long startTime = System.currentTimeMillis();
        copyFile("D:\\2.log", "D:\\3.log");
        long endTime = System.currentTimeMillis();
        System.out.println("Zero Copy (via transferTo) Time: " + (endTime - startTime) + " ms");
    }
}
```

#### 🎯sendFile机制和mmap机制的区别
sendFile机制更适合于大文件传输和网络服务器中的静态文件发送等场景；而mmap机制则更适用于对文件内容的频繁读写操作以及进程间共享内存等场景。

#### 🎯消息写入 CommitLog —— mmap + PageCache（伪零拷贝）
这种方式被称为 “内存映射文件 + PageCache” 的高性能写入模式，它通过 mmap 将 CommitLog 文件映射到内存，写消息时直接操作 PageCache，避免了传统 write 系统调用的数据拷贝，极大提升了写入吞吐。

+ RocketMQ 将消息顺序写入 CommitLog 文件；
+ 使用 FileChannel.map() 将文件映射为 MappedByteBuffer；
+ 消息写入本质是 对内存的写操作，实际写入的是 PageCache；
+ 刷盘由操作系统异步完成；如果配置的是同步刷盘，RocketMQ 调用 fsync 或 fdatasync 系统调用来强制刷新 PageCache 到磁盘。

#### 🎯消息拉取（Consumer 拉消息）—— transferTo() + FileChannel（真正的零拷贝）
当消费者从 Broker 拉取消息时，RocketMQ 会：

+ 根据 ConsumeQueue 找到消息在 CommitLog 中的偏移和大小；
+ 使用 FileChannel.transferTo( position, count, writableChannel ) 方法；
+ 将文件数据直接从 内核的 PageCache 传输到 Socket 缓冲区；
+ 底层调用 Linux 的 sendfile() 系统调用。

```java
// RocketMQ 源码中类似逻辑
FileChannel fileChannel = commitLog.getFileChannel();
SocketChannel socketChannel = ...;

// 零拷贝传输
fileChannel.transferTo(position, size, socketChannel);
```

RocketMQ 在消息拉取时，使用 FileChannel.transferTo() 方法，底层触发 Linux 的 sendfile() 系统调用，实现从文件 PageCache 直接到 Socket 缓冲区的传输，CPU 不参与数据拷贝，是真正的零拷贝技术，极大提升了网络吞吐、降低了 CPU 使用率。

#### 🎯顺序写加速文件写入磁盘
RocketMQ 的设计哲学是：把所有消息当成一个大日志流，顺序追加写入一个文件。写指针只增不减，像记日志一样追加写，减少寻址开销。

```java
CommitLog 文件（物理上可能不连续，但逻辑上连续）
|
├── 消息1（Producer A）
├── 消息2（Producer B）
├── 消息3（Producer A）
├── 消息4（Producer C）
└── ...（不断追加）
```

### **1.4 消息幂等**
#### 🎯消息幂等的必要性
1. 发送时消息重复，当一条消息已被服务端完成持久化，此时出现了网络的闪断，导致MQ服务端对生产者客户端响应失败，此时生产者意识到消息发送失败并再次尝试发送消息。
2. 投递时消息重复，消息已经投递消费者并完成业务的处理，当客户端反馈的时候，出现了网络闪断，为了保证消息至少被消费一次，MQ服务端会再次投递已经消费的消息，消费者后面会受到两条MessageID相同的消息。
3. 负载均衡的时候重复消费：消费者新增实例c2，c2被分配了c1之前消费的两个队列，c2接着c1之前消费到的offset，如果offset是异步提交，c1之前消费到10，异步提交到8，c2就会消费重复消息。幂等性在消费端是需要做好的。

#### 🎯处理方式
最好使用业务上的唯一标识作为MessageKey来投递消息，业务处理根据MessageKey来判断是否已经消费。

### **1.5 Rebalance机制**
Rebalance（重平衡）是 RocketMQ 中 Consumer Group 内多个消费者实例之间，动态分配订阅队列（MessageQueue）的过程，目的是实现负载均衡和高可用。

#### 🎯为什么要 Rebalance
假设：

+ 一个 Topic 有 4 个 MessageQueue（分区）；
+ 一个 Consumer Group 有 2 个消费者实例（C1、C2）；

理想情况：

+ C1 消费 Q0、Q1
+ C2 消费 Q2、Q3
+ → 负载均衡

但如果：

+ C2 宕机了 → C1 要接管 Q2、Q3
+ C3 上线了 → 要重新分配队列
+ → 这就是 Rebalance 的作用：自动调整队列分配，保持负载均衡和容错

#### 🎯触发原因
+ 消费者启动/宕机/断开
+ Broker 增减队列

#### 🎯Rebalance 发生在客户端，不是 Broker
消费者通过 长连接监听 Broker 的通知，一旦有变化，就触发 Rebalance。

流程如下：

1. 消费者 A 获取当前 Group 的所有消费者列表（从 Broker 获取）
2. 获取当前 Topic 的所有 MessageQueue 列表（从 Broker 获取）
3. 对两个列表分别排序（保证所有消费者看到的顺序一致）
4. 使用负载均衡算法（如平均分配）计算：我该消费哪些队列
5. 更新本地消费队列分配
6. 启动或停止对应的 PullTask

✅ 所有消费者都按相同规则计算，结果一致，无需中心协调。

```properties
初始状态：
  C1 消费 Q0, Q1, Q2, Q3

C2 上线：
  1. C2 注册到 Broker
  2. Broker 通知 C1：“你们 Group 有变化，Rebalance！”
  3. C1 收到通知：
        - 停止 Q0~Q3 的 PullTask
        - 查询当前消费者：[C1, C2]
        - 查询队列：[Q0, Q1, Q2, Q3]
        - 计算：我（C1）分 Q0, Q1
        - 启动 Q0, Q1 的 PullTask
  4. C2 同样流程：
        - 查询列表
        - 计算：我（C2）分 Q2, Q3
        - 启动 Q2, Q3 的 PullTask
```

#### 🎯负载均衡算法
RocketMQ 提供多种分配策略，默认是：

✅ 默认策略：AllocateMessageQueueAveragely（平均分配）

```properties
消费者：[C1, C2, C3]  （排序后）
队列：  [Q0, Q1, Q2, Q3, Q4, Q5]

分配：
C1 → Q0, Q1
C2 → Q2, Q3
C3 → Q4, Q5
```

其他策略：

+ AllocateMessageQueueConsistentlyHashing：一致性哈希，减少 Rebalance 影响
+ AllocateMessageQueueRoundRobin：轮询分配

#### 🎯Rebalance带来的问题
暂停消费：例如开始只有一个消费者从c1，负责消费5个队列，新增了一个c2，触发Rebalance，需要分配两个队列给c2，c1就需要暂停这两个队列的消费。

重复消费：c2在消费分配给自己的两个队列时，必须接着c1之前消费到的offset，如果offset是异步提交，c1之前消费到10，异步提交到8，c2就会消费重复消息。幂等性在消费端是需要做好的。

消费突刺：rebalance停留时间过长，导致c2后面会面临大量的消息需要消费。

#### 🎯如何避免Rebalance的频繁发生
1. 使用固定的 instanceName，即使 IP 变了，Broker 也认为是同一个消费者重新连接，不会触发全量 Rebalance。

```properties
consumer.setInstanceName("consumer-group-001"); // 固定名称
```

2. 增大心跳间隔和超时时间（根据网络质量调整）

```properties
consumer.setHeartbeatBrokerInterval(30_000); // 默认 30s，可适当增大
```

3. 选择合适的负载均衡策略，默认 AllocateMessageQueueAveragely 在消费者增减时，所有队列都可能重新分配，影响大。推荐：使用 一致性哈希 策略，减少 Rebalance 影响范围：

```properties
consumer.setAllocateMessageQueueStrategy(
    new AllocateMessageQueueConsistentHash()
);
```





