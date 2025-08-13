## **1. 搭建Dledger高可用集群**
### **1.1 生产级别搭建**
假设我们要搭建拥有三个master节点的集群，每个master节点都搭配两个从节点，那么一共就是9个Broker实例，然后我们还需要三个NameServer实例，一共是需要12台服务器。

```properties
172.17.10.49	nameserver-cluster-a
172.17.10.50	nameserver-cluster-b
172.17.10.51	nameserver-cluster-c
172.17.10.52	broker-cluster-a-node-1
172.17.10.53	broker-cluster-a-node-2
172.17.10.54	broker-cluster-a-node-3
172.17.10.55	broker-cluster-b-node-1
172.17.10.56	broker-cluster-b-node-2
172.17.10.57	broker-cluster-b-node-3
172.17.10.58	broker-cluster-c-node-1
172.17.10.59	broker-cluster-c-node-2
172.17.10.60	broker-cluster-c-node-3
```

1. 分别单独启动三个NameServer节点构成集群，因为节点之间不需要通信，简单启动就好。
2. broker-cluster-a-node-1配置文件

```properties
#定义集群的名称
brokerClusterName = PrivacyCluster  
 
#定义Broker的名称
brokerName=broker-PrivacyCluster-A
 
#服务监听端口
listenPort=30911

brokerIP1=172.17.10.52
 
#nameserver节点
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
 
#数据存储目录(消息存储路径)
storePathRootDir=/opt/rocketmq/data/store
 
#commitlog目录
storePathCommitLog=/opt/rocketmq/data/commitlog/
 
#是否使用DLeger 模式
enableDLegerCommitLog=true
 
#DLeger分组，一般与brokerName相同
dLegerGroup=broker-PrivacyCluster-A
 
#集群中其他节点,实现Dleger内部通信(命名规则，第一个字母为自定义，从第二个开始必须为数字 （n10是ID)
dLegerPeers=n10-172.17.10.52:40911;n11-172.17.10.53:40911;n12-172.17.10.54:40911
## must be unique
 
#当前节点信息，上面定义的ID
dLegerSelfId=n10
 
#========追加配置项===========
#开启异步刷盘
flushDiskType=ASYNC_FLUSH
 
#线上关闭自动创建topic
autoCreateTopicEnable=false
 
#开启临时存储池-异步刷盘建议开启
TransientStorePoolEnable=true
 
#同步刷盘建议使用重入锁-异步建议关闭
useReentrantLockWhenPutMessage=false
 
#发送消息的最大线程数，默认1，同步刷盘建议适当增大，建议配置成CPU核数
sendMessageThreadPoolNums=8
 
#关闭堆内存数据传输-建议关闭，可以提高拉消息效率，(false可能导致消费者超时 TPS上不去)
#transferMsgByHeap=false
transferMsgByHeap=true
 
#开启消息轨迹,建议再集群中新增加个节点，并仅再新增节点上开启消息轨迹
#traceTopicEnable=true
 
#开启从Slave读数据功能
slaveReadEnable=true
 
#linux建议开启 Epoll IO模型
useEpollNativeSelector=true
 
#启用ACL访问控制(不添加ACL访问控制，可直接跳过ACL访问控制的配置)
aclEnable=true
```

3. broker-cluster-a-node-2配置文件

```properties
[root@broker-cluster-a-node-2 ~]# vim /opt/rocketmq/conf/dledger/broker-cluster.conf
brokerClusterName = PrivacyCluster
brokerName=broker-PrivacyCluster-A
listenPort=30911
brokerIP1=172.17.10.53
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
storePathRootDir=/opt/rocketmq/data/store
storePathCommitLog=/opt/rocketmq/data/commitlog/
enableDLegerCommitLog=true
dLegerGroup=broker-PrivacyCluster-A
dLegerPeers=n10-172.17.10.52:40911;n11-172.17.10.53:40911;n12-172.17.10.54:40911
## must be unique
dLegerSelfId=n11  #修改此处
sendMessageThreadPoolNums=16
flushDiskType=ASYNC_FLUSH
autoCreateTopicEnable=false
TransientStorePoolEnable=true
useReentrantLockWhenPutMessage=false
sendMessageThreadPoolNums=8
#transferMsgByHeap=false
transferMsgByHeap=true
slaveReadEnable=true
useEpollNativeSelector=true
```

4. broker-cluster-a-node-3配置文件

```properties
[root@broker-cluster-a-node-3 ~]# vim  /opt/rocketmq/conf/dledger/broker-cluster.conf
brokerClusterName = PrivacyCluster
brokerName=broker-PrivacyCluster-A
listenPort=30911
brokerIP1=172.17.10.54
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
storePathRootDir=/opt/rocketmq/data/store
storePathCommitLog=/opt/rocketmq/data/commitlog/
enableDLegerCommitLog=true
dLegerGroup=broker-PrivacyCluster-A
dLegerPeers=n10-172.17.10.52:40911;n11-172.17.10.53:40911;n12-172.17.10.54:40911
## must be unique 
dLegerSelfId=n12  #修改此处
sendMessageThreadPoolNums=16
flushDiskType=ASYNC_FLUSH
autoCreateTopicEnable=false
TransientStorePoolEnable=true
useReentrantLockWhenPutMessage=false
sendMessageThreadPoolNums=8
#transferMsgByHeap=false
transferMsgByHeap=true
slaveReadEnable=true
useEpollNativeSelector=true
```

5. broker-cluster-b-node-1配置文件

```properties
brokerClusterName = PrivacyCluster
brokerName=broker-PrivacyCluster-B #修改此处
listenPort=30911
brokerIP1=172.17.10.55
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
storePathRootDir=/opt/rocketmq/data/store
storePathCommitLog=/opt/rocketmq/data/commitlog/
enableDLegerCommitLog=true
dLegerGroup=broker-PrivacyCluster-B #修改此处
dLegerPeers=n21-172.17.10.55:40911;n22-172.17.10.56:40911;n23-172.17.10.57:40911 #修改此处
## must be unique
dLegerSelfId=n21 #修改此处
sendMessageThreadPoolNums=16
flushDiskType=ASYNC_FLUSH
autoCreateTopicEnable=false
TransientStorePoolEnable=true
useReentrantLockWhenPutMessage=false
sendMessageThreadPoolNums=8
#transferMsgByHeap=false
transferMsgByHeap=true
slaveReadEnable=true
useEpollNativeSelector=true
```

6. broker-cluster-b-node-2配置文件

```properties
brokerClusterName = PrivacyCluster
brokerName=broker-PrivacyCluster-B #修改此处
listenPort=30911
brokerIP1=172.17.10.56
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
storePathRootDir=/opt/rocketmq/data/store
storePathCommitLog=/opt/rocketmq/data/commitlog/
enableDLegerCommitLog=true
dLegerGroup=broker-PrivacyCluster-B #修改此处
dLegerPeers=n21-172.17.10.55:40911;n22-172.17.10.56:40911;n23-172.17.10.57:40911 #修改此处
## must be unique
dLegerSelfId=n22 #修改此处
sendMessageThreadPoolNums=16
flushDiskType=ASYNC_FLUSH
autoCreateTopicEnable=false
TransientStorePoolEnable=true
useReentrantLockWhenPutMessage=false
sendMessageThreadPoolNums=8
#transferMsgByHeap=false
transferMsgByHeap=true
slaveReadEnable=true
useEpollNativeSelector=true
```

7. broker-cluster-b-node-3配置文件

```properties
brokerClusterName = PrivacyCluster
brokerName=broker-PrivacyCluster-B #修改此处
listenPort=30911
brokerIP1=172.17.10.57
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
storePathRootDir=/opt/rocketmq/data/store
storePathCommitLog=/opt/rocketmq/data/commitlog/
enableDLegerCommitLog=true
dLegerGroup=broker-PrivacyCluster-B #修改此处
dLegerPeers=n21-172.17.10.55:40911;n22-172.17.10.56:40911;n23-172.17.10.57:40911 #修改此处
## must be unique 
dLegerSelfId=n23 #修改此处
sendMessageThreadPoolNums=16
flushDiskType=ASYNC_FLUSH
autoCreateTopicEnable=false
TransientStorePoolEnable=true
useReentrantLockWhenPutMessage=false
sendMessageThreadPoolNums=8
#transferMsgByHeap=false
transferMsgByHeap=true
slaveReadEnable=true
useEpollNativeSelector=true
```

8. broker-cluster-c-node-1配置文件

```properties
brokerClusterName = PrivacyCluster
brokerName=broker-PrivacyCluster-C  #修改此处
listenPort=30911
brokerIP1=172.17.10.58
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
storePathRootDir=/opt/rocketmq/data/store
storePathCommitLog=/opt/rocketmq/data/commitlog/
enableDLegerCommitLog=true
dLegerGroup=broker-PrivacyCluster-C #修改此处
dLegerPeers=n31-172.17.10.58:40911;n32-172.17.10.59:40911;n33-172.17.10.60:40911 #修改此处
## must be unique
dLegerSelfId=n31  #修改此处
sendMessageThreadPoolNums=16
flushDiskType=ASYNC_FLUSH
autoCreateTopicEnable=false
TransientStorePoolEnable=true
useReentrantLockWhenPutMessage=false
sendMessageThreadPoolNums=8
#transferMsgByHeap=false
transferMsgByHeap=true
slaveReadEnable=true
useEpollNativeSelector=true
```

9. broker-cluster-c-node-2配置文件

```properties
brokerClusterName = PrivacyCluster
brokerName=broker-PrivacyCluster-C #修改此处
listenPort=30911 
brokerIP1=172.17.10.59
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
storePathRootDir=/opt/rocketmq/data/store
storePathCommitLog=/opt/rocketmq/data/commitlog/
enableDLegerCommitLog=true
dLegerGroup=broker-PrivacyCluster-C #修改此处
dLegerPeers=n31-172.17.10.58:40911;n32-172.17.10.59:40911;n33-172.17.10.60:40911 #修改此处
## must be unique
dLegerSelfId=n32  #修改此处
sendMessageThreadPoolNums=16
flushDiskType=ASYNC_FLUSH
autoCreateTopicEnable=false
TransientStorePoolEnable=true
useReentrantLockWhenPutMessage=false
sendMessageThreadPoolNums=8
#transferMsgByHeap=false
transferMsgByHeap=true
slaveReadEnable=true
useEpollNativeSelector=true
```

10. broker-cluster-c-node-3配置文件

```properties
brokerClusterName = PrivacyCluster
brokerName=broker-PrivacyCluster-C  #修改此处
listenPort=30911
brokerIP1=172.17.10.60
namesrvAddr=172.17.10.49:9876;172.17.10.50:9876;172.17.10.51:9876
storePathRootDir=/opt/rocketmq/data/store
storePathCommitLog=/opt/rocketmq/data/commitlog/
enableDLegerCommitLog=true
dLegerGroup=broker-PrivacyCluster-C  #修改此处
dLegerPeers=n31-172.17.10.58:40911;n32-172.17.10.59:40911;n33-172.17.10.60:40911  #修改此处
## must be unique
dLegerSelfId=n33  #修改此处
sendMessageThreadPoolNums=16
flushDiskType=ASYNC_FLUSH
autoCreateTopicEnable=false
TransientStorePoolEnable=true
useReentrantLockWhenPutMessage=false
sendMessageThreadPoolNums=8
#transferMsgByHeap=false
transferMsgByHeap=true
slaveReadEnable=true
useEpollNativeSelector=true
```

### **1.2 学习级别搭建**
1. <font style="background-color:rgba(255, 255, 255, 0);">服务器192.168.204.130 配置 broker-n0.conf</font>

```java
vim /usr/local/rocketmq/rocketmq-all-4.9.1-bin-release/conf/dledger/broker-n0.conf
```

```properties
# 集群名称，多个 Broker 设置相同的集群名构成一个集群
brokerClusterName = RaftCluster

# Broker 名称，相同名称的 Broker 组成一个主从组（同一组内通过 dLeger 选举主节点）
brokerName=RaftNode00


# Broker 监听端口，用于客户端（Producer/Consumer）连接
listenPort=30911


# NameServer 地址列表，多个地址以分号分隔
namesrvAddr=192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876

# Broker 外网 IP 地址，注册到 NameServer 并供客户端使用
brokerIP1=192.168.204.130

# 是否允许自动创建 Topic，建议生产环境关闭
autoCreateTopicEnable=true

# 是否启用消息属性过滤（如 SQL92 过滤），需客户端配合使用
enablePropertyFilter=true

# 消息存储根目录
storePathRootDir=/tmp/rmqstore/node00

# CommitLog 存储路径
storePathCommitLog=/tmp/rmqstore/node00/commitlog

# 启用 DLedger 模式，开启后使用 Raft 协议实现高可用和数据复制
enableDLegerCommitLog=true

# DLedger 组名，同一组内多个节点通过此名称组成 Raft 复制组，通常与 brokerName 一致
dLegerGroup=RaftNode00

# DLedger 节点列表，格式为 id-ip:port，用于组内节点间通信（选举、日志复制）
dLegerPeers=n0-192.168.204.130:40911;n1-192.168.204.131:40912;n2-192.168.204.132:40913

# 当前节点在 DLedger 组中的唯一标识
dLegerSelfId=n0

# 发送消息线程池大小，用于处理 Producer 的发送请求
sendMessageThreadPoolNums=16
```



2. <font style="background-color:rgba(255, 255, 255, 0);">服务器192.168.204.131 配置 broker-n1.conf</font>

```java
vim /usr/local/rocketmq/rocketmq-all-4.9.1-bin-release/conf/dledger/broker-n1.conf
```

```properties
brokerClusterName = RaftCluster
brokerName=RaftNode00
listenPort=30921
namesrvAddr=192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876
brokerIP1=192.168.204.131
autoCreateTopicEnable=true
enablePropertyFilter=true
storePathRootDir=/tmp/rmqstore/node01
storePathCommitLog=/tmp/rmqstore/node01/commitlog
enableDLegerCommitLog=true
dLegerGroup=RaftNode00
dLegerPeers=n0-192.168.204.130:40911;n1-192.168.204.131:40912;n2-192.168.204.132:40913
dLegerSelfId=n1
sendMessageThreadPoolNums=16

```



3. <font style="background-color:rgba(255, 255, 255, 0);">服务器192.168.204.132 配置 broker-n2.conf</font>

```java
vim /usr/local/rocketmq/rocketmq-all-4.9.1-bin-release/conf/dledger/broker-n2.conf
```

```properties
brokerClusterName = RaftCluster
brokerName=RaftNode00
listenPort=30931
namesrvAddr=192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876
brokerIP1=192.168.204.132
autoCreateTopicEnable=true
enablePropertyFilter=true
storePathRootDir=/tmp/rmqstore/node02
storePathCommitLog=/tmp/rmqstore/node02/commitlog
enableDLegerCommitLog=true
dLegerGroup=RaftNode00
dLegerPeers=n0-192.168.204.130:40911;n1-192.168.204.131:40912;n2-192.168.204.132:40913
dLegerSelfId=n2
sendMessageThreadPoolNums=16

```



4. <font style="background-color:rgba(255, 255, 255, 0);">启动集群</font>

```java
//分别先在三台服务器启动nameserver
nohup sh  bin/mqnamesrv > -n 192.168.204.130:9876 /dev/null 2>&1  &
nohup sh  bin/mqnamesrv > -n 192.168.204.131:9876 /dev/null 2>&1  &
nohup sh  bin/mqnamesrv > -n 192.168.204.132:9876 /dev/null 2>&1  &
//然后分别启动broker服务，如果在配置文件中配置了namesrvAddr，就不用使用-n 来指定NameServer地址了
//192.168.204.130
nohup sh  bin/mqbroker  -c conf/dledger/broker-n0.conf  > /dev/null 2>&1  &
nohup sh  bin/mqbroker   -n '192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876' -c conf/dledger/broker-n0.conf  > /dev/null 2>&1  &
//192.168.204.131
nohup sh  bin/mqbroker   -c conf/dledger/broker-n1.conf  > /dev/null 2>&1  &
nohup sh  bin/mqbroker  -n '192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876' -c conf/dledger/broker-n1.conf  > /dev/null 2>&1  &
//192.168.204.132
nohup sh  bin/mqbroker   -c conf/dledger/broker-n2.conf  > /dev/null 2>&1  &
nohup sh  bin/mqbroker   -n '192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876' -c conf/dledger/broker-n2.conf  > /dev/null 2>&1  &
```



5. 查看集群

```java
//查看集群，BID为0的应该就是主节点
sh bin/mqadmin clusterList -n 127.0.0.1:9876
```

![](https://cdn.nlark.com/yuque/0/2024/png/32520881/1716513119734-0bd5cf6e-7a4c-4e5e-af5d-5ad61728da99.png)



6. 搭建控制台

![](https://cdn.nlark.com/yuque/0/2024/png/32520881/1716513349251-5af2e4f9-a8f6-4985-b4dc-e5a599876da0.png)

![](https://cdn.nlark.com/yuque/0/2024/png/32520881/1716513368857-6a8e69b8-1ff2-4c41-9424-87f371330bc8.png)

