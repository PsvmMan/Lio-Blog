## **1. RocketMQ的API使用**
### **1.1 同步发送**
普通消息，消息发送默认采用round-robin策略来选择所发送到的队列。如果发送失败，默认重试2次。但在重试时是不会选择上次发送失败的Broker，而是选择其它Broker，如果只有一个Broker，会选择其他的队列，如果超过重试次数，则抛出异常。当Producer出现RemotingException、MQClientException、MQBrokerException时，Producer会自动重投消息。

```java
public class SyncProduct {
    public static void main(String[] args) throws Exception{
        DefaultMQProducer syncProduct = new DefaultMQProducer("simpleGroup");
        syncProduct.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        // 设置同步发送失败时重试发送的次数，默认为2次
        syncProduct.setRetryTimesWhenSendFailed(3);
        // 设置发送超时时限为5s，默认3s
        syncProduct.setSendMsgTimeout(5000);
        syncProduct.start();
        for (int i = 0; i < 10; i++) {
            Message message = new Message("simpleTopic","simpleTags",("同步发送"+i).getBytes(RemotingHelper.DEFAULT_CHARSET));
            SendResult sendResult = syncProduct.send(message);
            System.out.println(sendResult);
        }
        syncProduct.shutdown();
    }
}
```

```properties
# 消息发送失败重试次数,默认为2
rocketmq.producer.retry-times-when-send-failed=2
```

### **1.2 异步发送**
如果是异步发送是存在回调函数的。异步发送失败重试时，异步重试不会选择其他Broker，仅在当前Broker上做重试，所以该策略无法保证消息不丢失。

```java
public class AsyncProduct {
    public static void main(String[] args) throws Exception{
        DefaultMQProducer asyncProduct = new DefaultMQProducer("asyncProduct");
        asyncProduct.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        asyncProduct.setSendMsgTimeout(1000*60);
        // 指定异步发送失败后不进行重试发送，默认重试2次
        asyncProduct.setRetryTimesWhenSendAsyncFailed(0);
        asyncProduct.start();
        int msgCount = 10;
        final CountDownLatch countDownLatch = new CountDownLatch(msgCount);
        for (int i = 0; i < msgCount; i++) {
            Message message = new Message("simpleTopic","simpleTags",("异步发送"+i).getBytes(RemotingHelper.DEFAULT_CHARSET));
            asyncProduct.send(message, new SendCallback() {
                @Override
                public void onSuccess(SendResult sendResult) {
                    System.out.println(sendResult);
                    countDownLatch.countDown();
                }

                @Override
                public void onException(Throwable throwable) {
                    System.out.println(throwable.getMessage());
                    countDownLatch.countDown();
                }
            });
        }
        countDownLatch.await(60, TimeUnit.SECONDS);
        asyncProduct.shutdown();
        System.out.println("发送完毕");
    }
}
```

```properties
# 异步消息发送失败重试次数,默认为2
rocketmq.producer.retry-times-when-send-async-failed=2
```

### **1.3 单向发送**
单向发送方法，没有返回值，也没有回调，也没有重试机制，只管把消息发送出去。

```java
public class OneWayProduct {
    public static void main(String[] args) throws Exception{
        DefaultMQProducer oneWayProduct = new DefaultMQProducer("oneWayProduct");
        oneWayProduct.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        oneWayProduct.setSendMsgTimeout(1000*60);
        oneWayProduct.start();
        for (int i = 0; i < 10; i++) {
            Message message = new Message("simpleTopic","simpleTags",("单向发送"+i).getBytes(RemotingHelper.DEFAULT_CHARSET));
            oneWayProduct.sendOneway(message);  //异步的
        }
        Thread.sleep(10*1000);
        oneWayProduct.shutdown();
        System.out.println("发送完毕");
    }
}
```

### **1.4 延迟消息**
延迟消息实现的效果就是在调用producer.send方法后，消息并不会立即发送出去，而是会等一段时间再发送出去。这是RocketMQ特有的一个功能。那会延迟多久呢？延迟时间的设置就是在Message消息对象上设置一个延迟级别message.setDelayTimeLevel(3);

开源版本的RocketMQ中，对延迟消息并不支持任意时间的延迟设定(商业版本中支持)，而是只支持18个固定的延迟级别，1到18分别对应messageDelayLevel=1s 5s 10s 30s 1m 2m 3m 4m 5m 6m 7m 8m 9m 10m 20m 30m 1h 2h。

```java
public class ScheduledMessageProduct {
    public static void main(String[] args) throws Exception{
        DefaultMQProducer product = new DefaultMQProducer("ScheduledMessageProduct");
        product.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        product.setSendMsgTimeout(1000*60);
        product.start();
        String[] tags = new String[] {"TagA", "TagB", "TagC", "TagD"};
        for (int i = 0; i < 20; i++) {
            int orderId = i%4;
            Message msg = new Message("ScheduledTopic",tags[i%4],"key"+i,("hi,rocketmq"+i).getBytes());
            //延迟消息，messageDelayLevel=1s 5s 10s 30s 1m 2m 3m 4m 5m 6m 7m 8m 9m 10m 20m 30m 1h 2h
            msg.setDelayTimeLevel(5);
            SendResult sendResult = product.send(msg, new MessageQueueSelector() {
                @Override
                public MessageQueue select(List<MessageQueue> mqs, Message message, Object arg) {
                    Integer id = (Integer) arg;
                    return mqs.get(id);
                }
            }, orderId);
            System.out.println(sendResult);
        }
        product.shutdown();
    }
}
```

### **1.5 批量消息**
批量消息是指将多条消息合并成一个批量消息，一次发送出去。这样的好处是可以减少网络IO，提升吞吐量。

相信大家在官网以及测试代码中都看到了关键的注释：如果批量消息大于1MB就不要用一个批次发送，而要拆分成多个批次消息发送。也就是说，一个批次消息的大小不要超过1MB实际使用时，这个1MB的限制可以稍微扩大点，实际最大的限制是4194304字节，大概4MB。但是使用批量消息时，这个消息长度确实是必须考虑的一个问题。而且批量消息的使用是有一定限制的，这些消息应该有相同的Topic，相同的waitStoreMsgOK。而且不能是延迟消息、事务消息等。

### **1.6 过滤消息**
在大多数情况下，可以使用Message的Tag属性来简单快速的过滤信息。在一些比较复杂的场景就有点不足了。 这时候，可以使用SQL表达式来对消息进行过滤。`broker.conf`需要配置`enablePropertyFilter=true`

```java
public class SqlProduct {
    public static void main(String[] args) throws Exception{
        DefaultMQProducer product = new DefaultMQProducer("OrderProduct");
        product.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        product.setSendMsgTimeout(1000*60);
        product.start();
        String[] tags = new String[] {"TagA", "TagB", "TagC", "TagD"};
        for (int i = 0; i < 20; i++) {
            int orderId = i%4;
            Message msg = new Message("orderTopic",tags[i%4],"key"+i,("hi,rocketmq"+i).getBytes());
            msg.putUserProperty("a",i+"");
            SendResult sendResult = product.send(msg, new MessageQueueSelector() {
                @Override
                public MessageQueue select(List<MessageQueue> mqs, Message message, Object arg) {
                    Integer id = (Integer) arg;
                    return mqs.get(id);
                }
            }, orderId);
            System.out.println(sendResult);
        }
        product.shutdown();
    }
}
```

```java
public class SqlConsumer {
    public static void main(String[] args) throws Exception{
        DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("orderConsumer");
        consumer.setConsumeFromWhere(ConsumeFromWhere.CONSUME_FROM_FIRST_OFFSET);
        consumer.subscribe("orderTopic", MessageSelector.bySql("(TAGS is not null and TAGS in ('TagA','TagB','TagB','TagD') ) and a is not null and a between 0 and 3"));
        consumer.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        consumer.setConsumeTimeout(60*1000);
        consumer.registerMessageListener(new MessageListenerOrderly() {
            @Override
            public ConsumeOrderlyStatus consumeMessage(List<MessageExt> msgs, ConsumeOrderlyContext context) {
                context.setAutoCommit(true);
                System.out.printf("%s Receive New Messages: %s %n", Thread.currentThread().getName(), msgs);
                return ConsumeOrderlyStatus.SUCCESS;
            }
        });
        consumer.start();
        System.out.printf("Consumer Started.%n");
    }
}
```

### **1.7 推送模式-消费消息**
在推模式下，消息被主动推送到消费者。实际上RocketMQ的推模式也是由拉模式封装出来的（可以通过不断地轮询拉取消息来模拟推模式）。

为了顺序消费每个队列中的消息，下面设置消费者实例的线程数目为1，假使现在有两个队列，由于线程数目是1，消息只能一个一个的处理，所以这样可以实现队列内消息的有序性，但通常不建议这么使用的。

MessageListenerConcurrently为什么不适合做有序消息呢，为了队列内消息的有序性，正常而言只需要给队列加锁，控制单个队列的访问顺序，而线程数目设置为1，相当于是对所有的队列进行串行的访问，所以当我们需要使用顺序队列的时候，监听应该使用MessageListenerOrderly。

```java
public class PushConsumer {
    public static void main(String[] args) throws Exception{
        DefaultMQPushConsumer pushConsumer = new DefaultMQPushConsumer("pushConsumer");
        pushConsumer.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        pushConsumer.subscribe("simpleTopic","simpleTags");
        pushConsumer.setConsumeFromWhere(ConsumeFromWhere.CONSUME_FROM_FIRST_OFFSET);
        pushConsumer.setConsumeTimeout(60*1000);
        //定义重试次数
        pushConsumer.setMaxReconsumeTimes(3);
        //设置消费者最大并发消费线程数。这决定了单个消费者实例在消费消息时，可以使用的最大线程数。
        pushConsumer.setConsumeThreadMax(1);
        pushConsumer.setConsumeThreadMin(1);
        pushConsumer.registerMessageListener(new MessageListenerConcurrently() {
            @Override
            public ConsumeConcurrentlyStatus consumeMessage(List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
                try {
                    for (MessageExt msg : msgs) {
                        String messageBody = new String(msg.getBody(), "UTF-8");
                        if(messageBody.equals("同步发送2")){
                            throw new RuntimeException("处理消息报错");
                        }
                        System.out.println("接受到新消息：" + messageBody+"，队列："+msg.getQueueId());
                    }
                    return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
                } catch (Exception e) {
                    // 如果出现异常，你可以选择重新消费这批消息
                    // 注意：不要频繁地返回RECONSUME_LATER，否则可能会导致消息堆积
                    e.printStackTrace();
                    return ConsumeConcurrentlyStatus.RECONSUME_LATER;
                }
            }
        });
        pushConsumer.start();
        System.out.println("Consumer Started");
    }
}
```

对于无序消息（普通消息、延时消息、事务消息）集群消费下的重试消费，无序消息的重试只针对集群消费模式生效，广播消费模式不提供失败重试特性，默认允许每条消息最多重试16次，如果消息重试16次后仍然失败，消息将被投递至死信队列。某条消息在一直消费失败的前提下，将会在接下来的4小时46分钟之内进行16次重试，超过这个时间范围消息将不再重试投递，而被投递至死信队列。消息重试间隔时间如下：

![](https://cdn.nlark.com/yuque/0/2024/png/32520881/1716815395754-b0a81112-60d3-438e-bd00-256202e01ba5.png)

#### 🎯MessageListenerConcurrently
MessageListenerConcurrently 是 RocketMQ 的并发消费接口，默认配置是 20 个线程。

设计目标就是：最大化吞吐量，不保证顺序。如果使用 MessageListenerConcurrently，即使 topic 只有一个队列，consumer 设置了 2 个线程，那么这个队列的消息也会被「并行消费」。

**Pull 拉取机制不变：**

+ 消费者从 同一个队列（MessageQueue） 拉取消息；
+ 拉回来一批消息（如 32 条），放入本地缓存；

**提交线程池并发处理：**

+ 每条消息（或一批）被提交到 consumeThreadMin/Max 配置的线程池中；
+ 多个线程同时处理同一个队列拉回来的消息；
+ 不需要排队、不加锁。

### **1.8 拉取模式-消费消息**
拉模式的代码较为复杂，需要自己管理偏移量，每次拉取消息后也要更新偏移量，以便下次拉取从正确的位置开始。作为了解就不学习具体代码实现。

### **1.9 顺序消息**
正常情况下生产者也是需要发送消息到多个队列的，实现局部有序（队列内有序）；如果想要全局有序，那就把消息发送到一个队列，但不建议这么做，因为影响性能。顺序消息的发送是没有重试机制的，因为为了保证顺序性，在发生故障时，不可能把消息发送到其他的队列上，肯定会导致顺序破坏。

```java
public static void main(String[] args) throws Exception{
    DefaultMQProducer product = new DefaultMQProducer("OrderProduct");
    product.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
    product.setSendMsgTimeout(1000*60);
    // 顺序消息，重试次数设置为0，不重试
    syncProduct.setRetryTimesWhenSendFailed(0);
    product.start();
    String[] tags = new String[] {"TagA", "TagB", "TagC", "TagD"};
    for (int i = 0; i < 20; i++) {
        int orderId = i%4;
        Message msg = new Message("orderTopic",tags[i%4],"key"+i,("hi,rocketmq"+i).getBytes());
        SendResult sendResult = product.send(msg, new MessageQueueSelector() {
            @Override
            public MessageQueue select(List<MessageQueue> mqs, Message message, Object arg) {
                Integer id = (Integer) arg;
                return mqs.get(id);
            }
        }, orderId);
        System.out.println(sendResult);
    }
    product.shutdown();
}
```

消费者可以并发线程处理多个队列的消息，但是单个队列会保证有序消费。当Consumer消费消息失败后，为了保证消息的顺序性，其会自动不断地进行消息重试（默认重试Integer.MAX次），直到消费成功。消费重试默认间隔时间为1000ms。重试期间应用会出现消息消费被阻塞的情况。由于对顺序消息的重试是无休止的，不间断的，直至消费成功，所以，对于顺序消息的消费，务必要保证应用能够及时监控并处理消费失败的情况，避免消费被永久性阻塞。

```java
public class OrderConsumer {
    public static void main(String[] args) throws Exception{
        DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("orderConsumer");
        consumer.setConsumeFromWhere(ConsumeFromWhere.CONSUME_FROM_FIRST_OFFSET);
        consumer.subscribe("orderTopic", "TagA || TagB || TagC || TagD");
        consumer.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        consumer.setConsumeTimeout(60*1000);
        consumer.registerMessageListener(new MessageListenerOrderly() {
            @Override
            public ConsumeOrderlyStatus consumeMessage(List<MessageExt> msgs, ConsumeOrderlyContext context) {
                try {
                    context.setAutoCommit(true);
                    for (MessageExt msg : msgs) {
                        String messageBody = new String(msg.getBody());
                        System.out.println("接受到新消息：" + messageBody+"，队列："+msg.getQueueId());
                    }
                    return ConsumeOrderlyStatus.SUCCESS;
                } catch (Exception e) {
                    e.printStackTrace();
                    return ConsumeOrderlyStatus.SUSPEND_CURRENT_QUEUE_A_MOMENT;
                }
            }
        });
        consumer.start();
        System.out.println("Consumer Started.");
    }
}
```

同时为了提高并行处理的能力，还可以往同一个消费者组中添加消费者实例，如下面的OrderConsumer2和上面的OrderConsumer在同一个消费组。

```java
public class OrderConsumer2 {
    public static void main(String[] args) throws Exception{
        DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("orderConsumer");
        consumer.setConsumeFromWhere(ConsumeFromWhere.CONSUME_FROM_FIRST_OFFSET);
        consumer.subscribe("orderTopic", "TagA || TagB || TagC || TagD");
        consumer.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        consumer.setConsumeTimeout(60*1000);
        consumer.registerMessageListener(new MessageListenerOrderly() {
            @Override
            public ConsumeOrderlyStatus consumeMessage(List<MessageExt> msgs, ConsumeOrderlyContext context) {
                try {
                    context.setAutoCommit(true);
                    for (MessageExt msg : msgs) {
                        String messageBody = new String(msg.getBody());
                        System.out.println("接受到新消息：" + messageBody+"，队列："+msg.getQueueId());
                    }
                    return ConsumeOrderlyStatus.SUCCESS;
                } catch (Exception e) {
                    e.printStackTrace();
                    return ConsumeOrderlyStatus.SUSPEND_CURRENT_QUEUE_A_MOMENT;
                }
            }
        });
        consumer.start();
        System.out.println("Consumer Started.");
    }
}
```

#### 🎯MessageListenerOrderly
MessageListenerOrderly 是 RocketMQ 提供的顺序消费接口，它的设计目标就是：保证同一个 MessageQueue 的消息被串行处理。

**锁粒度：以 MessageQueue 为单位加锁**

+ RocketMQ 内部为每个 MessageQueue 维护一个 锁（临界区）；
+ 每次消费前，消费者必须获取该队列的锁；
+ 获取成功 → 执行消费逻辑；
+ 执行完 → 释放锁。

**线程池只是“执行器”，不打破顺序**

+ 虽然你设置了 consumeThreadMin=2，有 2 个线程；
+ 但这两个线程在消费 同一个队列 时，必须竞争同一把锁；
+ 结果：同一时刻，只有一个线程能消费这个队列。

### **1.10 并发消费和顺序消费的区别**
1. 顺序消费和并发消费的重试机制并不相同，顺序消费消费失败后会先在客户端本地重试直到最大重试次数，这样可以避免消费失败的消息被跳过，消费下一条消息而打乱顺序消费的顺序，而并发消费消费失败后会将消费失败的消息重新投递回服务端，再等待服务端重新投递回来，在这期间会正常消费队列后面的消息。
2. 并发消费失败后并不是投递回原Topic，而是投递到一个特殊Topic，其命名为%RETRY%ConsumerGroupName，集群模式下并发消费每一个ConsumerGroup会对应一个特殊Topic，并会订阅该Topic。
3. 对于顺序消费，重试间隔是可以自己设置的，并发消费的重试间隔是阶梯变化的。对于顺序消息，最大重试次数默认是Integer.MAX，可设置；并发消息最大重试次数默认为16次，这个重试次数可设置，当指定的重试次数超过16次之后，消息重试时间间隔均为2小时。

![](https://cdn.nlark.com/yuque/0/2024/png/32520881/1716815435072-8bf9db6e-21fd-410e-b3f0-05889c3661aa.png)

4. 并发消费有两个状态CONSUME_SUCCESS和RECONSUME_LATER。返回CONSUME_SUCCESS代表着消费成功，返回RECONSUME_LATER代表进行消息重试。顺序消费目前也是两个状态：SUCCESS和SUSPEND_CURRENT_QUEUE_A_MOMENT。SUSPEND_CURRENT_QUEUE_A_MOMENT意思是先暂停消费一下，过SuspendCurrentQueueTimeMillis时间间隔后再重试一下，而不是放到重试队列里。

### **1.11 消费重试配置**
1. 集群消费模式下，消息消费失败后期望消息重试，需要在消息监听器接口的实现中明确进行配置(三种方式任选一种)：

```java
consumer.registerMessageListener(new MessageListenerConcurrently() {
    @Override
    public ConsumeConcurrentlyStatus consumeMessage(List<MessageExt> msgs,ConsumeConcurrentlyContext context) {
        //消息处理逻辑抛出异常，消息将重试。
        doConsumeMessage(message);

        //方式1：返回Action.ReconsumeLater，消息将重试。
        return ConsumeConcurrentlyStatus.RECONSUME_LATER;

        //方式2：返回null，消息将重试。
        return null;

        //方式3：直接抛出异常，消息将重试。
        throw new RuntimeException("Consumer Message exception");
    }
});

```

2. 集群消费模式下，消息失败后期望消息不重试，需要捕获消费逻辑中可能抛出的异常，最终返回ConsumeConcurrentlyStatus.CONSUME_SUCCESS，此后这条消息将不会再重试。

```java
consumer.registerMessageListener(new MessageListenerConcurrently() {
    @Override
    public ConsumeConcurrentlyStatus consumeMessage(List<MessageExt> msgs,ConsumeConcurrentlyContext context) {
        try {
            doConsumeMessage(message);
        } catch (Throwable e) {
            //捕获消费逻辑中的所有异常，并返回ConsumeConcurrentlyStatus.CONSUME_SUCCESS
            return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
        }

        //消息处理正常，直接返回消费成功
        return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
    }
});

```

3. 获取消息重试了多少次

```java
@Override
public ConsumeConcurrentlyStatus consumeMessage(List<MessageExt> msgs,ConsumeConcurrentlyContext context) {
    
    for (MessageExt msg : msgs) {
        //获取消息重试了多少次
        System.out.println(msg.getReconsumeTimes());
    }

    return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
}

```

### **1.12 死信队列**
当一条消息初次消费失败，消息队列会自动进行消费重试；达到最大重试次数后(默认16次)，若消费依然失败，则表明消费者在正常情况下无法正确地消费该消息，此时，消息队列不会立刻将消息丢弃，而是将其发送到该消费者对应的特殊队列中。

正常情况下无法被消费的消息称为死信消息(Dead-Letter Message)，存储死信消息的特殊队列称为死信队列(Dead-Letter Queue)。

#### 🎯死信消息特征
1. 不会再被消费者正常消费有效期与正常消息相同，均为3天，3天后会被自动删除
2. 一个死信队列对应一个Group ID，而不是对应单个消费者实例。名称为%DLQ%+ConsumGroup
3. 如果一个Group ID未产生死信消息，则不会为其创建相应的死信队列
4. 一个死信队列包含了对应Group ID产生的所有死信消息，而不区分该消息属于哪个Topic
5. 通常，一条消息进入了死信队列，意味着消息在消费处理的过程中出现了比较严重的错误，并且无法自行恢复。此时，一般需要人工去查看死信队列中的消息，对错误原因进行排查。然后对死信消息进行处理，比如转发到正常的Topic重新进行消费，或者丢弃。
6. 默认创建出来的死信队列，他里面的消息是无法读取的，在控制台和消费者中都无法读取。这是因为这些默认的死信队列，他们的权限perm被设置成了2:禁读(这个权限有三种 2:禁读，4:禁写,6:可读可写)。需要手动将死信队列的权限配置成6，才能被消费(可以通过mqadmin指定或者web控制台)。

### **1.13 广播消费**
在集群状态(MessageModel.CLUSTERING)下，每一条消息只会被同一个消费者组中的一个实例消费到(这跟kafka和rabbitMQ的集群模式是一样的)。而广播模式则是把消息发给了所有订阅了对应主题的消费者，而不管消费者是不是同一个消费者组。

```java
public class BroadcastConsumer {
    public static void main(String[] args) throws Exception{
        DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("consumer");
        consumer.setConsumeFromWhere(ConsumeFromWhere.CONSUME_FROM_FIRST_OFFSET);
        //广播模式
        consumer.setMessageModel(MessageModel.BROADCASTING);
        consumer.subscribe("orderTopic", "TagA || TagB || TagC || TagD");
        consumer.setNamesrvAddr("192.168.204.130:9876;192.168.204.131:9876;192.168.204.132:9876");
        consumer.setConsumeTimeout(60*1000);
        consumer.registerMessageListener(new MessageListenerConcurrently() {
            @Override
            public ConsumeConcurrentlyStatus consumeMessage(List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
                System.out.printf("%s Receive New Messages: %s %n", Thread.currentThread().getName(), msgs);
                return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
            }
        });
        consumer.start();
        System.out.printf("Consumer Started.%n");
    }
}
```

