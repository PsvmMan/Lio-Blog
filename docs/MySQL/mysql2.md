## **1. Mysql学习**
### **1.1 order by是怎么工作**
#### 🎯场景
在应用开发中，一定会经常碰到需要根据指定字段排序显示结果的需求，以市民表举例，假设查询城市是“杭州”的所有人的名字，并且按照姓名排序返回前1000个人的姓名、年龄。

```java
CREATE TABLE `t` (
  `id` int(11) NOT NULL,
  `city` varchar(16) NOT NULL,
  `name` varchar(16) NOT NULL,
  `age` int(11) NOT NULL,
  `addr` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `city` (`city`)
) ENGINE=InnoDB;

```

执行`explain select city,name,age from t where city='杭州' order by name limit 1000;`可以得到这个查询的执行计划，Extra这个字段中的“Using filesort”表示需要排序，mysql会给每个线程分配一块内存用于排序，称为sort_buffer。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694397585039-7db41746-ab92-4ddf-902e-9afc8fe0394a.png)

#### 🎯Using filesort
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694416695736-defa1e2a-de4f-47db-b4b8-5ac06c9fbfa0.png)`select city,name,age from t where city='杭州' order by name limit 1000;`这个查询流程如下：

1. 初始化sort_buffer，确定放入name、city、age这三个字段；
2. 从索引city找到第一个满足city='杭州’条件的主键id，也就是图中的ID_X；
3. 到主键id索引取出整行，取name、city、age三个字段的值，存入sort_buffer中；
4. 从索引city取下一个记录的主键id；
5. 重复步骤3、4直到city的值不满足查询条件为止，对应的主键id也就是图中的ID_Y；
6. 对sort_buffer中的数据按照字段name做快速排序；
7. 按照排序结果取前1000行返回给客户端。

      上述查询的排序过程，可能在内存中完成，也可能需要使用到外部排序，这取决于参数`sort_buffer_size`，如果要排序的数据量小于sort_buffer_size，排序就在内存中完成，内存放不下，则不得不利用磁盘临时文件辅助排序。

```java
//开启OPTIMIZER_TRACE功能
SET OPTIMIZER_TRACE="enabled=on",END_MARKERS_IN_JSON=on;
//设置要展示的数据条目数
SET optimizer_trace_offset=-30, optimizer_trace_limit=30;
//执行查询
select city,name,age from t where city='杭州' order by name limit 1000;
//查看查询的分析
SELECT * FROM INFORMATION_SCHEMA.OPTIMIZER_TRACE limit 30;
```

#### 🎯city和name创建联合索引，帮助排序
```java
alter table t add index city_user(city, name);

select city,name,age from t where city='杭州' order by name limit 1000;
```

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694421603585-f19a3bb5-1976-406b-90ef-03bb4bc53453.png)在这个索引里面，我们依然可以用树搜索的方式定位到第一个满足city='杭州’的记录，并且额外确保了，接下来按顺序取“下一条记录”的遍历过程中，只要city的值是杭州，name的值就一定是有序的。

1. 从索引(city,name)找到第一个满足city='杭州’条件的主键id；
2. 到主键id索引取出整行，取name、city、age三个字段的值，作为结果集的一部分直接返回；
3. 从索引(city,name)取下一个记录主键id；
4. 重复步骤2、3，直到查到第1000条记录，或者是不满足city='杭州’条件时循环结束。

#### 🎯<font style="color:rgb(53, 53, 53);">创建一个city、name和age的联合索引，覆盖索引</font>
```java
alter table t add index city_user_age(city, name, age);

select city,name,age from t where city='杭州' order by name limit 1000;
```

 这时，对于city字段的值相同的行来说，还是按照name字段的值递增排序的，此时的查询语句也就不再需要排序了。而且也不用进行回表操作了，这样整个查询语句的执行流程就变成了：

1. 从索引(city,name,age)找到第一个满足city='杭州’条件的记录，取出其中的city、name和age这三个字段的值，作为结果集的一部分直接返回；
2. 从索引(city,name,age)取下一个记录，同样取出这三个字段的值，作为结果集的一部分直接返回；
3. 重复执行步骤2，直到查到第1000条记录，或者是不满足city='杭州’条件时循环结束。

### **1.2 sql语句逻辑相同，性能差异却巨大**
#### 🎯条件函数操作
在SQL查询中，如果对索引字段进行函数操作，可能会破坏该字段原有的有序性，从而导致索引无法被有效利用。虽然某些函数操作（例如加减常数）实际上并不会改变字段的有序性，但MySQL优化器在处理这类情况时存在一定的“保守”或“惰性”行为——它不会尝试推断函数是否保持了有序性，因此即使像 id + 1 = 10000 这样简单的表达式，也无法使用 id 上的索引进行快速定位。

尽管 id + 1 = 10000 在逻辑上等价于 id = 9999，而后者完全可以利用索引高效查询，但优化器无法自动完成这种等价转换。因此，为了确保查询能够正确走索引，我们需要在编写SQL时手动将表达式重写为对索引列的直接比较，例如将 where id + 1 = 10000 改写为 where id = 10000 - 1。

这提醒我们在实际开发中应避免在索引列上使用任何形式的表达式或函数，尽量保持索引列的“纯净”，以便优化器能够准确识别并利用索引，提升查询性能。

#### 🎯隐式类型转化
 拿字符串和数字类型的字段转换而言，这里有个简单的方法可以进行验证，看`select '10' > 9`的结果：

1. 如果是“字符串转换为数字”，那么就是做数字比较，结果应该是1；
2. 如果是“数字转化为字符串”，那么就是做字符串比较，结果应该是0。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694513672598-fe6bec5a-a6f2-4f38-b056-12bff4bc6818.png)

`explain select *  from tradelog where t_modified = 20160714`，例如这个例子，`t_modified`是个字符串类型的索引，结果explain查看执行计划却发现是全表扫描，因为对于优化器而言这个sql相当于是`select * from tradelog where CAST(tradid AS signed int) = 110717;`，对索引字段进行了函数操作。

`explain select *  from tradelog where t_modified = '20160714'`，例如这个例子，t_modified是个int类型的索引，explain查看执行计划发现是索引扫描，因为对于优化器而言这个sql相当于是将后面的'20160714'转化为int类型，对索引字段没有进行破坏。

#### 🎯隐式字符编码转换
表tradelog，注意字符集是utf8mb4，它是utf8编码的超集，表trade_detail，注意字符集是utf8。

utf8mb4 是 utf8 的超集，意思是：utf8mb4 支持 utf8 支持的所有字符；并且还支持更多的字符（比如 emoji、一些生僻汉字等）。

因为 utf8mb4 是 utf8 的超集，所以在隐式转换场景下，肯定是将utf8转为utf8mb4，这样才能保证不丢失任何信息。

```sql
CREATE TABLE `tradelog` (
  `id` int(11) NOT NULL,
  `tradeid` varchar(32) DEFAULT NULL,
  `operator` int(11) DEFAULT NULL,
  `t_modified` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `tradeid` (`tradeid`),
  KEY `t_modified` (`t_modified`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `trade_detail` (
  `id` int(11) NOT NULL,
  `tradeid` varchar(32) DEFAULT NULL,
  `trade_step` int(11) DEFAULT NULL, /*操作步骤*/
  `step_info` varchar(32) DEFAULT NULL, /*步骤信息*/
  PRIMARY KEY (`id`),
  KEY `tradeid` (`tradeid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


insert into tradelog values(1, 'aaaaaaaa', 1000, now());
insert into tradelog values(2, 'aaaaaaab', 1000, now());
insert into tradelog values(3, 'aaaaaaac', 1000, now());

insert into trade_detail values(1, 'aaaaaaaa', 1, 'add');
insert into trade_detail values(2, 'aaaaaaaa', 2, 'update');
insert into trade_detail values(3, 'aaaaaaaa', 3, 'commit');
insert into trade_detail values(4, 'aaaaaaab', 1, 'add');
insert into trade_detail values(5, 'aaaaaaab', 2, 'update');
insert into trade_detail values(6, 'aaaaaaab', 3, 'update again');
insert into trade_detail values(7, 'aaaaaaab', 4, 'commit');
insert into trade_detail values(8, 'aaaaaaac', 1, 'add');
insert into trade_detail values(9, 'aaaaaaac', 2, 'update');
insert into trade_detail values(10, 'aaaaaaac', 3, 'update again');
insert into trade_detail values(11, 'aaaaaaac', 4, 'commit');
```



`<font style="color:rgb(53, 53, 53);">select d.* from tradelog l, trade_detail d where d.tradeid=l.tradeid and l.id=2;</font>`

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694568659150-ef1a6e91-11cf-4195-b86c-e495731d7be2.png)上面这个sql，首先<font style="color:rgb(53, 53, 53);">tradelog</font>表可以通过id = 2进行主键索引到一条数据，接下来再把<font style="color:rgb(53, 53, 53);">tradelog</font>表的tradeid字段去trade_detail表中检索，但是发现竟然是全表扫描，tradeid在trade_detail表可是有索引的，造成这个原因就是两个表的字符集不对等的原因。

由于utf8mb4是utf8的超集，那么utf8的字段的编码是要转化为utf8mb4的编码，相当于如下sql，`<font style="color:rgb(53, 53, 53);">select * from trade_detail where CONVERT(traideid USING utf8mb4)=tradelog.tra</font>deid;`，索引字段隐式的使用了函数，所以导致了索引的失效。



`<font style="color:rgb(53, 53, 53);">select l.operator from tradelog l , trade_detail d where d.tradeid=l.tradeid and d.id=4;</font>`

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694569254799-2706ddc3-e2cd-4265-82fe-eaabf838e09e.png)

       上面这个sql为啥就能走索引了呢？因为这时候trade_detail成为了驱动表，id = 4肯定是可以走trade_detail的主键索引的，而接下来就是把trade_detail的tradeid字段去tradelog表检索，虽然字符编码不对等，但是tradelog的字符编码是超集，所以要转化也是trade_detail.tradeid转化，`<font style="color:rgb(53, 53, 53);">select operator from tradelog where traideid =CONVERT(trade_detail.tradeid.value USING utf8mb4); </font>`<font style="color:rgb(53, 53, 53);">。</font>



针对上面字符编码不对等的问题，有两种优化办法：

1. 把trade_detail表上的tradeid字段的字符集改成utf8mb4

```java
alter table trade_detail modify tradeid varchar(32) CHARACTER SET utf8mb4 default null;
```

2. 改下sql

```java
select d.* from tradelog l , trade_detail d
    where d.tradeid=CONVERT(l.tradeid USING utf8) and l.id=2; 
```

#### 🎯网友案例
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694572312561-0459d735-842d-4c84-a6cb-1b8d868766f9.png)

这个案例我验证了网友的情况，没有复现，但网友可能现实生产案例表结构更为复杂，当做未来的一个注意点，可以参考一下。

### **1.3 为什么只查询一行数据，也这么慢**
#### 🎯等待MDL锁，查询长时间不返回
sessionB的查询被sessionA阻塞了。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694583595424-9e563f88-2db1-4227-9d76-fec8f3b5b15d.png)

使用`show processlist;`命令查看连接到Mysql服务器的活动线程（进程）信息。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694583688509-fc38c0cf-697d-4ca7-9547-7f33b3ee86f6.png)

使用`select blocking_pid from sys.schema_table_lock_waits;`找到造成阻塞的process id，然后使用`kill id`杀死阻塞的进程。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694583882076-39e1b2dc-5a31-4445-a060-48dd54eab254.png)

#### 🎯等待锁
sessionB的查询被sessionA阻塞了。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694585994703-4b9de2b5-aa52-4e12-8bb4-4f1faff690dc.png)

使用`select * from  sys.innodb_lock_waits where locked_table = 't';`可以查看到4号线程造成了阻塞，`kill 4;`直接断开这个连接，并且会自动回滚这个连接的事务，释放行锁。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694586166081-85f6acc7-4bd1-4fff-99d6-218ea634e93b.png)

#### 🎯查询慢
`select * from t where id=1;`一条这么简单的数据为何会查询很慢呢？看下下面的场景：

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694586925595-9b7093e8-87c3-44f3-b207-a8db9271764b.png)

sessionB更新完100万次，生成了100万个回滚日志，由于sessionA是一致性读，所以要在回滚日志中找到100万次修改之前的那行记录，所以才出现这个查询慢的情况。

#### 🎯where条件是普通字段 for update 会发生什么
`select * from t where c=5 for update`，会加什么锁，c是一个普通字段。普通字段会做全表扫描。

1. 在 Read Committed 隔离级别下，会锁上聚簇索引中的所有记录，而且语句执行完成后，InnoDB 就会把不满足条件的行的行锁去掉，也就是库里有3条数据，如果只有两条c=5，那么也只会锁住这两条数据。
2. 在 Repeatable Read 隔离级别下，会锁上聚簇索引中的所有记录，并且会锁上聚簇索引内的所有 GAP。

### **1.4 幻读是什么？幻读有什么问题**
#### 🎯表结构准备
```sql
CREATE TABLE `t` (
  `id` int(11) NOT NULL,
  `c` int(11) DEFAULT NULL,
  `d` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `c` (`c`)
) ENGINE=InnoDB;

insert into t values(0,0,0),(5,5,5),
(10,10,10),(15,15,15),(20,20,20),(25,25,25);
```

#### 🎯RR级别下，select * from t where d = 5 for update 为什么要锁住表中所有的数据以及空隙
1. 语义上，sessionA在T1时刻想要锁住d=5的所有行，如果SessionB可以把id = 0 的 d 修改为5，那么这时候sessionA就没有锁住所有d=5的行；同理如果允许sessionC去做插入，它可以插入一个d = 5的数据，也破坏了上述的语义。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694654836274-5f3137df-780d-4ea3-b95c-e458e3d5faa0.png)

2. 数据一致性的问题，锁的设计不仅是保证数据的一致性，还包含了数据和日志在逻辑上的一致性。这个问题我们以 `binlog_format=statement`的前提。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694655165447-cba12f82-b826-461a-bed8-d08fdb8aa441.png)

 现在来分析一下上图的执行结果：

1. 经过T1时刻，id=5这一行变成 (5,5,100)，当然这个结果最终是在T6时刻正式提交的;
2. 经过T2时刻，id=0这一行变成(0,5,5);
3. 经过T4时刻，表里面多了一行(1,5,5);	
4. 其他行跟这个执行序列无关，保持不变。

这么看这些数据好像没有什么问题，但是我们来看下binlog里面的内容：

`<font style="color:rgb(53, 53, 53);">update t set d=5 where id=0; /*(0,0,5)*/ </font>`

`<font style="color:rgb(53, 53, 53);">update t set c=5 where id=0; /*(0,5,5)*/ </font>`

`<font style="color:rgb(53, 53, 53);">insert into t values(1,1,5); /*(1,1,5)*/ </font>`

`<font style="color:rgb(53, 53, 53);">update t set c=5 where id=1; /*(1,5,5)*/ </font>`

`<font style="color:rgb(53, 53, 53);">update t set d=100 where d=5;/*所有d=5的行，d改成100*/</font>`

现在应该看出问题了，以后用binlog去克隆一个数据库，这三行的结果都变成了(0,5,100)、(1,5,100)和(5,5,100)。也就是说id = 0 和 id = 1这两行发生了数据不一致，这个问题很严重。



:::warning
如何解决上面的问题？

:::

我们分析一下可以知道，这是我们假设`select *  from t where d = 5 for update`这条语句只给

d = 5这一行加锁导致的问题。那么如果是这个查询扫描过程中碰到的行都加锁呢？

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694660827202-789cce33-782b-4be1-abae-f5c748edc56d.png)

binlog日志变成了下面这样：

`<font style="color:rgb(53, 53, 53);">insert into t values(1,1,5); /*(1,1,5)*/ </font>`

`<font style="color:rgb(53, 53, 53);">update t set c=5 where id=1; /*(1,5,5)*/ </font>`

`<font style="color:rgb(53, 53, 53);">update t set d=100 where d=5;/*所有d=5的行，d改成100*/ </font>`

`<font style="color:rgb(53, 53, 53);">update t set d=5 where id=0; /*(0,0,5)*/ </font>`

`<font style="color:rgb(53, 53, 53);">update t set c=5 where id=0; /*(0,5,5)*/</font>`

我们可以看到sessionB的问题我们解决了，但是sessionC依旧存在不一致的问题，那么这是为什么呢？因为数据之间是存在间隙的，而我们只是给存在的数据加锁，没有给间隙加锁。

:::warning
如何解决上面间隙问题

:::

InnoDB只好加入新的锁，也就是间隙锁(Gap Lock)，顾名思义，间隙锁就是锁住两个值之间的间隙，比如上面的数据插入6行数据，存在7个间隙。这样就可以解决上面的插入问题了。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694661414811-00395345-c02c-4dac-982f-935054148e46.png)

**和间隙锁冲突的是“往这个间隙插入一条记录”, 注意间隙锁之间是不存在冲突的**，可以看下面的例子，sessionB是不会被阻塞的，由于c=7不存在，sessionA加的是间隙锁(5,10)，而sessionB也是加的这个间隙锁，所依不冲突。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694662567999-322eec71-9fd3-442c-8e86-efb97f407d96.png)

#### 🎯间隙锁引入带来的困扰
sessionA和sessionB都只是判断记录是否存在，不存在就插入，结果出现了死锁。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694664553373-74f0d14c-b72f-4b56-ab6d-c5af0ccce170.png)

#### 🎯RC+binlog_format=row
1. RC + binlog_format=statement，在mysql5.0之前，binlog只有这种存储方式，所以会出现我们上面提到的插入带来的binlog逻辑数据不一致的情况，所以只好在RR模式下引入间隙锁来解决这个问题。
2. 后面RC+binlog_format=row这种组合方式可以避免binlog日志的问题，很多公司为了性能就会把隔离级别降为RC。可以提高并发度和降低死锁。
3. row的方式记录的是物理日志，例如sessionA想要把d = 5 的数据d值改成100，现在只有2条数据d = 5，它就会记录这两条记录要把d 改成 100；而后面的事务插入了一条d = 5的数据，就算先提交了，sessionA后提交也不会影响先提交的d = 5的这条记录，因为记录的是物理日志，不是逻辑日志。

### **1.5 RR下的加锁**
间隙锁在可重复读隔离级别下才有效，注意锁是加在索引上的。

#### 🎯加锁规则
1. 原则1：加锁的基本单位是 Next-Key Lock（临键锁），是 前开后闭区间 的锁，形式为：(gap_before, record]。
2. 原则2：加锁是“基于执行路径”的，不是基于最终结果。只要在查询过程中被“扫描”或“比较”过，就会加锁。
3. 优化1：唯一索引上的等值查询，找到值的情况下，next-key lock退化为行锁。
4. 优化2：索引上的等值查询，向右遍历时且最后一个值不满足等值条件的时候，next-key lock退化为间隙锁。
5. 一个bug：唯一索引上的范围查询会访问到不满足条件的第一个值为止。

#### 🎯唯一索引等值查询
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694762255757-45298b1b-89a0-456f-9255-bb21511b5d61.png)

1. 由于没有id = 7的记录，所以向右遍历到id = 10的时候，会结束遍历，加next-key (5,10]；
2. 根据优化2，next-key退化为间隙锁，(5,10)；
3. `最终结果：id索引上的(5,10)`

#### 🎯非唯一索引等值查询
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694762884468-acccda91-7c3a-4596-a9fc-af136a24b74f.png)

1. 根据原则1，加锁next-key，(0,5]；
2. 因为c是普通索引，仅仅访问c=5是不会停下来的，需要向右继续遍历，查到c=10才放弃。根据原则2，访问到的都要加锁，因此要给(5,10]加next-key；
3. 但是同时符合优化2，等值查询遍历到最后一个不满足的数据时，可以退化为间隙锁，(5,10)；
4. 根据原则2，只有访问到的数据才会加锁，这个查询使用了索引覆盖，并不需要访问主键索引，所以主键索引上没有加任何锁，这就是sessionB的update语句可以执行完成。

需要注意的是，在这个例子中lock in share mode只锁覆盖索引，但是for update是不一样的，系统会认为你接下来会修改数据，因此顺便给满足条件的行的主键索引加上锁。

5. `最终结果：c索引上的(0,10)`

#### 🎯主键索引范围锁
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694766238205-635035af-a1c4-48e1-a803-62d2c526d0d9.png)

1. 先找到id = 10的行，加上next-key(5,10]，根据优化1，主键id的等值条件，退化为行锁，只加了id = 10这一行的行锁；
2. 范围查询继续往后找，找到id = 15停下来，加上next-key（10,15]；
3. 扫描id = 15属于范围查询，所以不存在优化2的退化为间隙锁。
4. 最终结果：id上的[10,15]。

#### 🎯非唯一索引的范围锁
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694766780869-72b71087-e564-4568-b3cb-1b368131d5b4.png)

1. c = 10的时候加上next-key（5,10]，不是唯一索引没有优化规则;
2. 继续扫描到id = 15才停止，加next-key（10，15]。
3. `最终结果c索引上的(5,15]`，id上的

#### 🎯唯一索引范围锁bug
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694766942515-44510855-0531-40dd-b122-c5d639b2a25e.png)

1. 应该加锁next-key(10,15]，并且因为id是唯一索引，应该判断到id = 15这一行应该停止了；
2. 但实际上，InnoDB会扫描到第一个不满足条件的行为止，也就是id = 20，所以会加next-key（15,20]。

#### 🎯非唯一索引上存在“等值”的例子
 插入一条新数据：`<font style="color:rgb(53, 53, 53);">insert into t values(30,10,30);</font>`可以看到虽然两个c=10，但是它们的主键值id是不同的（分别是10和30），因此两个c = 10之间也是存在间隙的。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694767367121-9e25a53d-f32a-4fc9-af73-fa73956f6036.png)

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694767495687-2d4d99b4-e25b-4048-b0d8-01addc6bed25.png)

1. c = 10，加next-key lock，(c=5,id=5)~(c=10,id=10)；
2. 普通索引等值查询要继续往右找，c = 15，然后退化为间隙锁，(c=10,id=10)~(c=15,id=15)的间隙锁。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694767699313-5e6bc92a-ab10-42be-8ee8-0e2b4ca7d15b.png)

所以`insert into t(id,c,d) values(22,10,30);`这个插入会被阻塞，它(c=10,id=22)属于上面的范围，而`insert into t(id,c,d) values(22,22,30);`就不会被阻塞了。

#### 🎯limit语句加锁
 插入一条新数据：`<font style="color:rgb(53, 53, 53);">insert into t values(30,10,30);</font>`

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694771705638-30cd6df8-cf8b-4950-ab70-f32e5799983c.png)

在这个例子中，sessionA的delete语句加了limit2，你知道表t里c = 2的记录只有两条，因此加不加limit2效果都是一样的，但是加锁的效果却是不同的。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694771901530-c5bcbe1c-2dde-4cee-ab62-0b9c5f3a5c75.png)

#### 🎯一个死锁例子
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694771981971-4ea691cf-c5e0-48e4-9c65-146089106ed7.png)

1. session A 启动事务后执行查询语句加lock in share mode，在索引c上加了next-key lock(5,10] 和间隙锁(10,15)；
2. session B 的update语句也要在索引c上加next-key lock(5,10] ，进入锁等待；
3. 然后session A要再插入(8,8,8)这一行，被session B的间隙锁锁住。由于出现了死锁，InnoDB让session B回滚。

**你可以能会问，sessionB的next-key lock不是没有申请成功吗？其实是这样的，sessionB的加next-key lock（5,10]操作，实际上分了两步，先是加（5,10）的间隙锁成功，然后加c=10的行锁才被阻塞的。**

#### 🎯总结
 对于是否会锁的总结，就看这幅图，一定要记住，在这个范围一定会被阻塞。很多不能理解的阻塞，一定要观察这个范围，去仔细思考。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694767699313-5e6bc92a-ab10-42be-8ee8-0e2b4ca7d15b.png)

### **1.6 mysql是怎么保证数据不丢的**
#### 🎯binlog 写入机制
binlog的写入逻辑比较简单，事务的执行过程中，先把日志写到binlog cache中，事务提交的时候，再把binlog cache写到binlog文件中。一个事务的binlog是不能拆开的，因此无论这个事务多大，也要保证一次性写入；系统给binlog cache分配了一片内存，每个线程一个，参数binlog_cache_size用于控制单个线程内binlog cache所占内存的大小，如果超过这个大小，就暂存到磁盘。

事务提交的时候，执行器把binlog cache里的完整事务写入到binlog中，并清空binlog cache。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694843399667-ebf5b514-2a18-4d6c-b2c5-cc80034d5c28.png)

可以看到，每个线程有自己的binlog cache，但是共用一份binlog文件。图中的write，指的是把日志写入到文件系统的page cache，并没有把数据持久化到磁盘，所以速度比较快。图中的fsync，才是将数据持久化到磁盘的操作，这个操作由参数sync_binlog控制的：

1. sync_binlog=0的时候，表示每次提交事务都只write，不fsync；
2. sync_binlog=1的时候，表示每次提交事务都会执行fsync；
3. sync_binlog=N的时候，表示每次提交事务都write，但累计N个事务后才fsync。

因此，在出现IO瓶颈的场景里，将sync_binlog设置成一个比较大的值，可以提升性能。在实际的业务场景中，考虑到丢失日志量的可控性，一般不建议将这个参数设成0，比较常见的是将其设置为100~1000中的某个数值。但是，将sync_binlog设置为N，对应的风险是：如果主机发生异常重启，会丢失最近N个事务的binlog日志。

#### 🎯redo log 写入机制
redolog文件存在三种状态，一是，存在redo log buffer中，物理上是在Mysql进程内存中；二是，写到磁盘，但没有持久化，物理上是在文件系统的page cache里面；三是，持久化到磁盘。日志写到redo-log-buffer是很快的，write到page cache也差不多，但是持久化到磁盘速度就会慢很多了。

为了控制redo log的写入策略，InnoDB提供了innodb_flush_log_at_trx_commit参数，它有三种可能的取值：

1. 设置为0的时候，表示每次事务提交时只把redo-log留在redo-log-buffer中；
2. 设置为1的时候，表示每次事务提交时都将redo-log直接持久化到磁盘；
3. 设置为2的时候，表示每次事务提交时都将redo-log写到page cache。

InnoDB有一个后台线程，每隔1秒，就会把redo log buffer中的日志，调用write写到文件系统的page cache，然后调用fsync持久化到磁盘。注意，事务执行中间过程的redo log也是直接写在redo log buffer中的，这些redo log也会被后台线程一起持久化到磁盘。也就是说，一个没有提交的事务的redo log，也是可能已经持久化到磁盘的。实际上，除了后台线程每秒一次的轮询操作外，还有两种场景会让一个没有提交的事务的redo log写入到磁盘中。

1. 一种是，redo log buffer占用的空间即将达到 innodb_log_buffer_size一半的时候，后台线程会主动写盘。注意，由于这个事务并没有提交，所以这个写盘动作只是write，而没有调用fsync，也就是只留在了文件系统的page cache。
2. 另一种是，并行的事务提交的时候，顺带将这个事务的redo log buffer持久化到磁盘。假设一个事务A执行到一半，已经写了一些redo log到buffer中，这时候有另外一个线程的事务B提交，如果innodb_flush_log_at_trx_commit设置的是1，那么按照这个参数的逻辑，事务B要把redo log buffer里的日志全部持久化到磁盘。这时候，就会带上事务A在redo log buffer里的日志一起持久化到磁盘。



这里需要说明的是，我们介绍两阶段提交的时候说过，时序上redo log先prepare， 再写binlog，最后再把redo log commit。如果把innodb_flush_log_at_trx_commit设置成1，那么redo log在prepare阶段就要持久化一次，因为有一个崩溃恢复逻辑是要依赖于prepare 的redo log，再加上binlog来恢复的。InnoDB就认为redo log在commit的时候就不需要fsync了，只会write到文件系统的page cache中就够了。通常我们说MySQL的“双1”配置，指的就是sync_binlog和innodb_flush_log_at_trx_commit都设置成 1。也就是说，一个事务完整提交前，需要等待两次刷盘，一次是redo log（prepare 阶段），一次是binlog。

这时候，你可能有一个疑问，这意味着我从MySQL看到的TPS是每秒两万的话，每秒就会写四万次磁盘。但是，我用工具测试出来，磁盘能力也就两万左右，怎么能实现两万的TPS？解释这个问题，就要用到组提交（group commit）机制了。

#### 🎯组提交
下面是之前一个事务，写完redo-log，再写binlog，这意味着多个事务，binlog日志想要凑成一组提交是比较难的，因为时间比较短。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694856010212-d7e62b34-7425-4924-9404-8f8a2ff3d3b2.png)

为了让一次fsync带的组成员更多，Mysql进行了一个优化，你可以看到下面的图片，这样间隔的操作为每个日志都提供了等待的时间，有机会让更多的事务一起提交。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694856157172-a2d246ad-401e-4f9b-829e-d1c16b6b753c.png)

如果你想提升binlog组提交的效果，可以通过设置 binlog_group_commit_sync_delay 和 binlog_group_commit_sync_no_delay_count来实现。这两个条件是或的关系，也就是说只要有一个满足条件就会调用fsync。所以，当binlog_group_commit_sync_delay设置为0的时候，binlog_group_commit_sync_no_delay_count也无效了。

1. binlog_group_commit_sync_delay参数，表示延迟多少微秒后才调用fsync;
2. binlog_group_commit_sync_no_delay_count参数，表示累积多少次以后才调用fsync。

#### 🎯WAL机制的好处
1. redo log 和 binlog都是顺序写，磁盘的顺序写比随机写速度要快；
2. 组提交机制，可以大幅度降低磁盘的IOPS消耗。

#### 🎯MySQL现在出现了性能瓶颈，而且瓶颈在IO上，可以通过哪些方法来提升性能呢？
1. 设置 binlog_group_commit_sync_delay 和 binlog_group_commit_sync_no_delay_count参数，减少binlog的写盘次数。这个方法是基于“额外的故意等待”来实现的，因此可能会增加语句的响应时间，但没有丢失数据的风险。
2. 将sync_binlog 设置为大于1的值（比较常见是100~1000）。这样做的风险是，主机掉电时会丢binlog日志。
3. 将innodb_flush_log_at_trx_commit设置为2。这样做的风险是，主机掉电的时候会丢数据。

我不建议你把innodb_flush_log_at_trx_commit 设置成 0。因为把这个参数设置成 0，表示redo log只保存在内存中，这样的话MySQL本身异常重启也会丢数据，风险太大。而redo log写到文件系统的page cache的速度也是很快的，所以将这个参数设置成2跟设置成0其实性能差不多，但这样做MySQL异常重启时就不会丢数据了，相比之下风险会更小。

#### 🎯为什么binlog cache是每个线程自己维护的，而redo log buffer是全局共用的？
MySQL这么设计的主要原因是，binlog是不能“被打断的”。一个事务的binlog必须连续写，因此要整个事务完成后，再一起写到文件里。而redo log并没有这个要求，中间有生成的日志可以写到redo log buffer中。redo log buffer中的内容还能“搭便车”，其他事务提交的时候可以被一起写到磁盘中。

#### 🎯事务执行期间，还没到提交阶段，如果发生crash的话，redo log肯定丢了，这会不会导致主备不一致呢？
 不会。因为这时候binlog 也还在binlog cache里，没发给备库。crash以后redo log和binlog都没有了，从业务角度看这个事务也没有提交，所以数据是一致的。

#### 🎯如果binlog写完盘以后发生crash，这时候还没给客户端答复就重启了。等客户端再重连进来，发现事务已经提交成功了，这是不是bug？
不是。你可以设想一下更极端的情况，整个事务都提交成功了，redo log commit完成了，备库也收到binlog并执行了。但是主库和客户端网络断开了，导致事务成功的包返回不回去，这时候客户端也会收到“网络断开”的异常。这种也只能算是事务成功的，不能认为是bug。

实际上数据库的crash-safe保证的是：

1. 如果客户端收到事务成功的消息，事务就一定持久化了；
2. 如果客户端收到事务失败（比如主键冲突、回滚等）的消息，事务就一定失败了；
3. 如果客户端收到“执行异常”的消息，应用需要重连后通过查询当前状态来继续后续的逻辑。此时数据库只需要保证内部（数据和日志之间，主库和备库之间）一致就可以了。



