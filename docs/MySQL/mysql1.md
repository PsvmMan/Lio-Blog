## **1. Mysql学习**
### **1.1 Mysql架构**
MySQL 的架构主要分为 Server 层 和 存储引擎层 两部分。

Server 层 包含连接器、查询缓存（8.0 版本前）、分析器、优化器、执行器等核心组件，实现了 MySQL 的大多数核心功能。所有内置函数（如日期、数学、加密函数等）以及跨存储引擎的功能（如存储过程、触发器、视图等）都在这一层完成。

存储引擎层 负责数据的存储与提取，采用插件式架构，支持 InnoDB、MyISAM、Memory 等多种引擎。自 MySQL 5.5.5 版本起，InnoDB 成为默认存储引擎，因其支持事务、行级锁、外键和高并发能力，被广泛应用于生产环境。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1689834479993-b6100890-19c5-40d2-b1e8-cf12728280f8.png)

#### 🎯连接器
 第一步使用客户端连接数据库，接待我们的是连接器，连接器负责建立连接、获取权限。

```sql
mysql -hlocalhost -P3306 -uroot -p
```

 输入完命令之后，会提示输入密码，虽然密码可以直接跟在-p后面，但这样可能会导致密码泄露。如果用户名和密码验证通过，连接器会到权限表里查出你拥有的权限，之后的权限判断都依赖这次的查询。这就意味着，即使你使用管理员账户对该用户进行了权限的修改，也不会影响已经存在的连接的权限，只有新建连接才会使用最新的权限。

连接完成之后，如果没有后续的动作，这个连接就处于空闲状态，使用：show processlist命令可以看到。如果长时间没有动静，连接器将会自动断开，由wait_timeout参数控制，默认8小时。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1689838682690-c53679a9-9253-408e-a553-4cb1b2e20e02.png)

建立连接的过程是复杂的，减少建立连接的动作，尽量使用长连接，使用长连接会发现Mysql的占用内存涨的特别快，mysql使用的临时内存是管理在连接对象里面的，这些资源在连接断开的时候才释放，如何解决内存占用太大的问题：

1. 定期断开连接。
2. Mysql5.7或者更新版本，可以在每次执行一个比较大的操作之后，通过执行mysql_reset_connection来重新初始化连接资源，这个过程不需要重连和重新做权限的校验，但是会将连接恢复到刚刚创建时的状态。

#### 🎯查询缓存
注意：MySQL 8.0版本直接将查询缓存整块功能删掉了！

连接成功之后，可以执行select语句，执行逻辑来到第二步：查询缓存。Mysql拿到一个查询会先看之前是否执行过这条sql，之前执行的sql及其结果会以key-value的形式保存。

但是缓存失效是非常频繁的，只要对表更新，缓存都会被情空。Mysql提供了“按需使用的方式”,可以将参数query_cache_type设置为DEMAND，这样默认的sql语句都不使用查询缓存，对于确定使用缓存的语句可以使用SQL_CACHE显示指定，例如：

```sql
select SQL_CACHE * from T where ID=10;
```

#### 🎯分析器
```sql
select  *  from T where ID=10;
```

 分析器先会做词法的分析，根据“select”判断是个查询语句，需要把“T”识别为表名，“ID”识别为列名，然后就是做语法分析，判断SQL是否满足Mysql的语法规则。会判断列是否真的存在。

#### 🎯优化器
```sql
select * from t1 join t2 using(ID)  where t1.c=10 and t2.d=20;
```

优化器是表里面存在多个索引的时候，决定使用哪个索引；或者一个语句有多表关联的时候，决定各个表的连接顺序。

上面sql，既可以先从t1表里取出c=10的记录的ID值，再根据ID关联到表t2，再判断t2的d值是否等于20；也可以先从t2表里取出d=20的记录的ID值，再根据ID关联到表t1，在判断t1的c值是否等于10。

#### 🎯执行器
开始执行的时候，要判断对表有没有执行权限，如果是命中缓存，会在查询缓存返回结果的时候做权限的校验。有权限就继续执行，根据表定义的引擎，去使用这个引擎提供的接口。

### **1.2 redo log和binlog**
查询的流程，更新同样也会走一遍，在一个表有更新的时候，跟这个表相关的查询缓存会失效，所以一般不建议使用查询缓存。与查询流程不一样的是，更新流程还涉及两个重要的日志模块，redo log（重做日志）、binlog（归档日志），其实还包括undo log。

#### 🎯redo log
```sql
//每个redo log文件的大小，单位为字节
SHOW VARIABLES LIKE 'innodb_log_file_size';
//redo log文件数量
SHOW VARIABLES LIKE 'innodb_log_files_in_group';
```

在Mysql中，每一次更新操作，不可能马上将数据更新到磁盘对应的那条数据上，这样会带来很高的IO成本。当有一条记录需要更新的时候，InnoDB引擎先将记录写到缓存数据页，并写入redo log，这个时候更新算是完成了。把缓存中的更新记录落在具体磁盘上面，往往是在Mysql系统比较空闲的时候去做的。上面描述的**先写日志、再落磁盘**就是WAL技术（write-Ahead-Logging）。

redo-log的大小也是固定的，比如可以配置一组4个文件，每个文件大小是1GB，从头开始写，写到末尾就回到开头循环写。**redo log记录的是物理日志**，例如数据的更新，它会记录物理page的地址、偏移量以及数据变更的值。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1690169831302-e8f01b33-9b8c-498b-ae27-ba85421f355a.png)

 write pos（写位置）是redo log当前的写入位置，当事务发生时，会将事务变更记录写入到redo log，write pos会不断的移动直到文件末尾，写到3号文件的末尾就回到0号文件的开头。checkpoint（检查点）是redo log的一个标记点，表示这个点之前的数据被刷新到数据文件中了，并更新checkpoint的位置。这样的设计，可以保证即使发生奔溃，从`checkpoint`到`write pos`的数据更改可以通过redo log进行恢复，协同工作确保了数据的持久性。从`write pos`到`checkpoint`之间空着的部分，可以用来记录新的变更记录。

1. 一是数据写入，Innodb引擎会将更改写入redo log，并移动`write pos`，这些更改首先驻留在内存中，但为了数据持久性，它们最终被写入到redo log中。
2. 二是Checkpoint触发，在多种情况下会被触发，例如系统空闲时、redo log文件不足时、或者根据配置的checkpoint频率，当checkpoint触发时，会确保checkpoint位置之前的所有变更都被刷新到数据文件中。
3. 三是清理旧的redo log数据，checkpoint之前的redo log数据可以被覆盖和清理，释放空间供新的写入使用。

#### 🎯binlog
Mysql从整体来看，分为两块，一块是Server层，一块是引擎层。redo log就是InnoDB引擎特有的日志，而server层也有自己自己的日志，称为binlog（归档日志）。

binlog记录了完整的逻辑记录，所以在数据库备份恢复的时候，一定要以binlog的数据为基础进行恢复。binlog记录的是逻辑日志，例如一个个update、insert、delete语句。

binlog_format是MySQL中的一个参数，用于指定二进制日志(binlog)的格式。二进制日志是MySQL用于复制和恢复的重要组成部分。 binlog_format=statement ：表示以语句为单位记录二进制日志。当有数据库操作时，会将相应的SQL语句记录到二进制日志中，例如"INSERT INTO table_name VALUES (...)"。这种格式可以记录更少的信息，因为它只需记录SQL语句，但由于SQL语句的执行可能涉及多条记录的改变，因此在一些特殊情况下可能会有非确定性。 binlog_format=row ：表示以行为单位记录二进制日志。当有数据库操作时，会将相应的行数据的改变记录到二进制日志中，包括修改之前和修改之后的完整行数据。这种格式可以提供更精确和确定性的日志记录，但会产生更多的日志数据。 总体来说，binlog_format=statement会产生更小的日志文件，但在某些情况下可能会导致非确定性的结果。而binlog_format=row则产生更大的日志文件，但可以提供更精确的数据更改日志记录。选择哪种格式取决于具体的需求和对数据一致性的要求。

#### 🎯binlog_format=statement在某些情况下可能会导致非确定性的结果
1. 非确定性函数：如果SQL语句中包含非确定性函数（如rand()），多次执行同一个SQL语句可能会得到不同的结果，因为binlog只记录了SQL语句而没有记录函数的具体结果。
2. 精度问题：在计算浮点数时，不同的数据库服务器可能具有不同的浮点数精度设置。因此，当binlog_format为statement时，在不同的服务器上执行相同的SQL语句可能会得到稍微不同的结果。
3.  初始状态和随机事件：如果SQL语句涉及到数据库中的初始状态或随机事件，例如自增主键、触发器、存储过程等，再次执行相同的SQL语句可能会引起不确定的结果。

#### 🎯有了redo log，为啥还要有binlog？
有了redo log，为什么还要有binlog，首先redo log只有InnoDB引擎有，其次，redo log是循环写的，不能持久保存所有的数据，redo log是不具备binlog的复制和备份能力的。

#### 🎯有了binlog，为啥还要有redo log？
因为binlog是不具备奔溃数据恢复的能力，例如给`set age = age + 1`，如果把binlog日志重写跑一遍，万一`age+1`操作之间执行成功了，现在又跑一次，数据就不对了，binlog记录日志的方式压根不知道哪个记录执行过了，哪个记录没有执行，压根没有办法恢复数据库。

redolog的checkPoint，大致可以认为checkPoint之前的记录已经刷盘了，checkPoint之后的数据还没有刷盘，在数据库奔溃之后，redolog知道从什么地方开始回放操作。binlog是做不到的。

#### 🎯binlog和redo log的交互过程
1. 在一个数据库事务中发生了写操作；
2. 记录undo log；
3. 将写操作的修改结果更新到缓存数据页中，如果当前数据不在缓存中，会先从磁盘中加载；
4. 更新redo log buffer，并且根据同步策略，如果`innodb_flush_log_at_trx_commit = 1`，立马将redolog刷新到磁盘，此时redo log完成一阶段的提交，日志内修改的记录状态设置为prepare；
5. 更新binlog buffer，如果`sync_binlog = 1`，binlog立马被刷新到磁盘中；
6. 事务提交（redo log 二段提交，日志内修改的记录设置为commit）；

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1690206785115-326e65cd-ff7f-4c7c-ac9b-a7000177127d.png)

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694241191984-5c0fe0d6-613b-4ac6-b392-56e9e9d5dda3.png)

#### 🎯redo log为什么需要两段提交
首先要知道，binlog用来数据备份和复制，redolog用来奔溃恢复，它们两个存在是为了完成对方都不能完成的任务，所以两段提交的目的就是要同时兼顾双方的功能。就以主从同步为例子，redolog其实就是代表主库的数据，binlog代表从库的数据，双方必须同时成功或者同时失败。

1. **先写redo log后写binlog的问题**

假设在redo log中写完，这时候binlog还没有写，Mysql进程异常重启，系统恢复之后通过redo log依然可以把数据还原。但是binlog之前由于没有完成就奔溃了，因此之后备份的binlog里面没有这条语句，如果有一天需要用binlog去恢复一个临时数据库，其实数据是不完整的，如果是主从同步，这时候子库是少了记录的。

2. **先写binlog后写redo log的问题**

binlog写完，redo log没有写，在数据库恢复之后，数据库是少了一条记录的，但是某一天通过binlog恢复一个临时数据库，和原库数据是不一致的。如果是主从同步，这时候子库是多了记录的。

3. **redo log两段提交如何解决问题的：**

如果redo log只写一次的话，那不管先写谁，都可能造成主从同步数据时不一致的情况出现，为了解决该问题，redo log设计成两段提交模式，整个执行过程中会出现三处奔溃点：

1. redo-log(prepare)：在写入准备状态的redo记录时宕机，事务还未提交，不会影响。
2. bin-log：写完redo-log的prepare后，在写binlog时奔溃，重启后会根据redo记录中的事务ID，回滚前面写入的数据。由于binlog没有写，所以也不会传到从库。
3. redo-log(commit)：在bin-log写入成功之后，写redo(commit)的时候奔溃，因为binlog写入成功了，从机也同步了数据，因此重启时直接再次提交事务，写入一遍redo(commit)记录即可。

这上面的三点其实可以理解为，只要binlog是完整的，那么下次恢复的时候就可以将redo log中未提交的数据提交。

#### 🎯mysql怎么知道binlog是完整的
一个事务的binlog是有完整的格式，statement格式的binlog，最后会有COMMIT；row格式的binlog，最后会有一个XID event。

另外，在mysql5.6.2版本以后，还引入了binlog-checksum参数，用来验证binlog内容的正确性。由于磁盘原因，可能会在日志中间出错的情况，mysql可以通过校验checksum的结果来发现。

#### 🎯redo-log和binlog是怎么关联起来的
它们有一个共同的字段，叫XID（事务ID），奔溃恢复的时候，扫描redo-log：

1. 如果碰到既有prepare、又有commit的redo-log，就直接提交；
2. 如果碰到只有prepare、而没有commit的redo-log，就拿着XID去binlog找对应的事务。

#### 🎯处于prepare阶段的redo-log加上完整的binlog，重启就能恢复，mysql为什么要这样设计
 binlog是完整的，就代表从库会使用binlog更新了数据，如果主库不恢复，主从数据就不一致了。

#### 🎯redo-log一般设置多大
如果是常见的几个TB的磁盘，redo-log设置四个文件，每个文件1个GB。

#### 🎯数据的最终落盘，是从redo-log更新还是从BufferPool更新？
 redo-log并没有记录数据页的完整数据，所以它没有能力自己去更新磁盘数据页。

1. 如果是正常运行的实例，脏页最终落盘，就是把内存的数据页写盘；
2. 在奔溃恢复的场景中，InnoDB如果判断一个数据页可能在奔溃时丢失了更新，就会把它读到内存，然后让redo-log更新内存内容，然后这个数据页就变成了脏页，就回到了第一种情况。

#### 🎯redo log buffer是什么？是先修改内存，还是先写redo-log文件？
redo-log-buffer就是一块内存，用来保存redo-log日志，但是真正把日志落到redo-log文件，是在执行commit语句时候做的，`innodb_flush_log_at_trx_commit = 1` 的情况下，**这个commit指的是第一次提交**。

#### 🎯WAL机制先写redo-log有啥好处
redo-log是顺序写，并且可以以组的形式提交，这两个因素足以让性能有很大的提升，redo-log主要是节省了随机写磁盘的IO消耗。

### **1.3 事务隔离级别**
 事务存在原子性、一致性、隔离性、持久性。

#### 🎯隔离性与隔离级别
1. 读未提交：最低的隔离级别，允许一个事务读取另一个事物未提交的数据，可能出现脏读。例如事务A读取了事务B未提交的数据，做了一系列操作，但是事务B回滚了，事务A提交了，这就完全有问题了，这也就是事务并发带来的问题。
2. 读已提交：允许一个事务只能读取另一个事务已提交的数据，避免了脏读，但可能出现不可重复读。

```sql
就以乐观锁的版本例子：
在读未提交的情况下，事务A获取库存得到10，事务B、C、D获取的都是10，这时候事务A修改为9但是未提交，
事务E获取的就是未提交的9，事务A提交成功，事务BCD更新都会失败，因为版本对不上，而事务E可以更新成功，这个例子可以成功两个事务。
在读已提交的情况下，事务A获取库存得到10，事务B、C、D获取的都是10，这时候事务A修改为9但是未提交，
事务E获取的还是10，因为9未提交，事务A提交成功，事务BCDE更新都会失败，因为版本对不上，这个例子只可以成功一个事务。
所以并发性读未提交明显更好，但是万一出现事务A回滚，数据就出现了不一致。
```

3. 可重复读：保证在同一个事物中多次读取同一数据时，结果始终一致，避免了脏读和不可重复读，Mysql默认的隔离级别；

```sql
例子：假设一个电商网站，用户可以浏览商品下单，同时用户也可以实时看到最新的库存量。
读已提交：因为普通的查询可以查询到已提交的库存量，即为普通查询就可以看到最新的库存量，所以并发情况下的用户下单和查看库存量是可以同时进行的，而不会相互干扰。
可重复读：在一个事务中，普通的查询看不到最新的库存量，只能使用for update查询最新库存，这样会导致其他并发事务的阻塞，如果不使用for update悲观锁，而是使用乐观锁，update的时候通过校验版本来判断是否修改，并发情况下将出现大量的更新失败。就这个例子而言，可重复读这个隔离级别不适合这个项目，读已提交是更优解。
所以在同样使用乐观锁的情况下，并发事务，读已提交下事务更新成功率会更高，而可重复读会面临大量的更新失败。
```

4. 串行化：最高的隔离级别，完全隔离事务，确保事务之间没有任何并发问题，但性能下降。

```sql
目前看串行化在普通的查询语句会加共享锁，允许其他事务读操作，都是会阻塞写操作
事务A:select * from user where id = 4;
事务B:select * from user where id = 4; //执行成功
事务B:update user set username = '22' where id =4; //阻塞
```

在实现上，数据库里面会创建read-view，访问的时候以视图的逻辑为准。在“可重复读”级别下，这个视图是在事务启动的时候创建的。在“读已提交”隔离级别下，这个视图是每个查询SQL执行的时候创建的。“读未提交”，直接返回记录上的最新值；而串行化直接加锁避免并发访问。

#### 🎯MVCC多版本并发控制
不同的事务读取同一行数据取的数据版本可能是不同的，在学习MVCC之前我们需要先了解以下3个概念：

1. 事务版本号：每次事务开启前都会从数据库获取一个自增长的事务ID，从事务ID判断事务开始的先后顺序。
2. 表隐藏列：DB_TRX_ID(记录操作该数据事务的事务ID)，DB_ROLL_PTR(指向上一个版本数据在undo log 里的位置指针)。
3. undo-log：保留数据被修改之前的日志。

![](https://cdn.nlark.com/yuque/0/2022/png/32520881/1666157000325-7ad7c7b7-753d-486f-8a2f-a5a0836a2c8e.png)

![](https://cdn.nlark.com/yuque/0/2022/png/32520881/1666157010401-aa323ec6-c9fb-48e4-a0de-0f63b99804df.png)

![](https://cdn.nlark.com/yuque/0/2022/png/32520881/1666157022381-dea9d55d-a894-49bd-9be9-1335f9094138.png)

事务获取的read view，它有如下几个重要的属性：

1. trx_ids：当前系统未提交的事务版本号集合；
2. low_limit_id：当前系统最大的事务版本号+1；
3. up_limit_id：系统活跃的事务最小版本号；
4. creat_trx_id：当前事务的版本号。

Read_View匹配条件：

1. 数据事务ID < up_limit_id，显示，代表这是已提交事务处理的数据，可以被查询；
2. 数据事务ID>=low_limit_id ，不显示，表示是新事务操作的数据，不可以被查询；
3. 数据事务ID处于之间，数据事务ID不存在于活跃事务ID集合，显示；若存在且等于当前的事务ID，显示；若存在不等于当前的事务ID不显示；
4. 上面不显示的情况，会从undolog查询历史版本记录，再来readview进行匹配，直到找到满足的记录，或者没有返回空结果。

#### 🎯MVCC防止不了幻读的原因
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1685602774811-529ab606-2a67-4aa1-ac7f-3a5d14616c07.png)

#### 🎯undo-log什么时候可以删除
InnoDB 使用 MVCC（多版本并发控制） 机制实现事务的隔离性，其依赖 undo log 来保存数据的历史版本。每个事务在执行快照读（SELECT）时会创建一个 Read View，用于判断哪些数据版本对它是“可见的”。

undo log 的删除时机由系统中最老的 Read View 决定：只有当某个 undo log 版本比系统中所有活跃事务的 Read View 都更旧时，该版本才可被 purge 线程安全清除。

如果存在一个长时间未提交的事务，它持有的 Read View 会阻止 purge 线程清理其之后产生的所有 undo log 版本，即使这些修改早已提交。这会导致undo log 文件持续增长，占用大量磁盘空间。例如下面的例子：

1. 9:00，事务A查询ID = 1的记录，事务迟迟不提交；
2. 事务B修改了ID = 1的记录的数据，commit；
3. 事务C修改了ID = 1的记录的数据，commit；
4. .......无数的事务修改了又提交；
5. 下午3点的时候，事务A才提交事务，那么这期间累计的undo-log都不能删除，因为你删除了，事务A想要找到自己对应的那条undo-log记录就找不到了，所以尽量不要使用长事务。

### **1.4 索引**
#### 🎯常见的索引类型
1. 哈希表，这是一种键-值存储的数据结构，只要输入待查找的key，就可以找到value，哈希的思路很简单，把值放到数组里，用一个哈希函数把key换算成一个确定的数组下标，不可避免的是，多个key经过哈希函数的换算值可能相同，处理这种情况会拉出一个链表，链表过长也可以演化为红黑树提高效率。所以，哈希表这种数据结构适用于等值查询，比如Memcacheed以及其他一些Nosql引擎。
2. 有序数组，它在等值查询和范围查询场景中性能都非常优秀，对于等值查询使用二分法可以快速得到结果，时间复杂度是O(log<sub>2</sub>n)。对于范围查询，也可以先找到最左边的边界，然后向右遍历直到右边界。如果仅仅看查询效率，有序数组是最好的数据结构，但是需要数据更新的时候就麻烦了，你往中间插入一个记录就必须挪动后面所有的记录，成本太高，所以有序数组只适用于静态存储引擎，例如你要保存2017年某个城市的所有人口信息，这类不会再修改的数据。
3. 搜索树，树可以有二叉和多叉，二叉树的效率是最高的，但是数据库存储并不使用二叉树，因为索引不止存在内存中，还要写在磁盘上。你可以想象，一棵100万节点的二叉树，树高20，一次查询可能要访问20个数据块。N叉树由于读写上的性能优势，以及适配磁盘的访问模式，已经被广泛应用到数据块引擎中，例如Innodb的B+树。

#### 🎯InnoDB逻辑存储模型
1. 表空间，从Innodb逻辑存储结构来看，所有的数据都被逻辑的存放在一个空间中，这个空间就叫做表空间。表空间由段、区、页组成。
2. 段，段分为索引段、数据段、回滚段等。其实索引段就是非叶子节点部分，而数据段就是叶子节点部分，回滚段用于数据的回滚和多版本控制。一个段包含256个区（256M）。
3. 区，区是页的集合，一个区包含64个连续页，默认大小1M（64 * 16K）。
4. 页，页是Innodb管理的最小单位，页大小通常为16KB。

#### 🎯InnoDB索引模型
![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1692761930651-929a4f66-e4c7-4fd8-b568-e3c8fed07170.png)

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1692761946803-2879a60d-2578-457a-bc31-cdb7bc60ceca.png)

从图中叶子节点的内容，索引的类型分为主键索引和非主键索引，主键索引的叶子节点存的是整行数据，主键索引也被称为聚簇索引；非主键索引的叶子节点内容是主键值，非主键索引也被称为二级索引。如果查询语句条件是`where ID = 500`，即为主键的查询方式，只需要检索主键索引这棵B+树；如果查询语句条件是`where k = 5`，则需要先搜索k索引树，获取主键的值，再去搜索主键索引树，这个过程就是`**回表**`。

所以在查询过程中，能使用主键查询当然使用主键查询，只能使用普通索引的时候，也要尽可能的避免回表操作，例如`select`后面接的字段都是普通索引包含的字段，这个时候就不用去回表查询所有的数据了。

#### 🎯InnoDB索引维护
B+树为了维护索引的有序性，在插入和删除的时候需要做必要的维护，以上面的图为例，如果插入新值为700，则只需要在R5记录后面加入一个新的记录，如果插入的是400，就相对麻烦需要挪动后面的数据，空出位置。

更糟糕的情况是，有时候数据的挪动需要申请一个新的数据页，然后挪动数据过去，这个过程称为页分裂，所以有时候会推荐建表的时候使用自增主键，这样每次新加一条记录，都是追加的操作，不涉及挪动其他记录。而且由于非叶子节点会存储主键值，如果是自增主键，普通索引的叶子节点占用的空间往往会越小（一般情况下以业务字段作为主键肯定比自增主键占用的空间大）。

**自增主键的优点：**

1. 插入始终发生在最右端
2. 页分裂频率低
3. 写入是顺序 I/O，性能高
4. 索引紧凑，页缓存命中率高

**随机主键的缺点：**

1. 频繁页分裂：每次中间插入都可能触发
2. 页利用率低：分裂后每页只有一半数据
3. 随机 I/O：写入位置不连续，磁盘性能下降
4. 索引碎片化：B+ 树不紧凑，页缓存效率低

#### 🎯最左前缀原则
以(name,age)联合索引为例，如果你要查询所有名字第一个字是“张”的人，`where name like '张%'`,这时你也能够用上索引name，找到第一个符合条件的记录，然后向后遍历，直到不满足条件为止。从这个例子可以看出，不只是索引的全部定义，只要满足最左前缀，就可以利用索引来加速检索了。`这个最左前缀可以是联合索引的最左N个字段，也可以是字符串索引最左M个字符`。

在建立联合索引，如何安排索引内的字段顺序，评估的标准是索引的复用能力，因为支持最左前缀原则，如果可以通过调整顺序，可以少维护一个索引，那么这个顺序就是优先考虑采用的。

#### 🎯索引下推
对于辅助的联合索引(name,age,position)，正常情况按照最左前缀原则，`SELECT * FROM employees WHERE name like 'LiLei%' AND age = 22 AND position ='manager'`这种情况只会走name字段索引，因为根据name字段过滤完，得到的索引行里的age和position是无序的（比如张1的age是22，而张2的age是25，张3的age是21，这个顺序是无序的），无法很好的利用索引。 

在`MySQL5.6`之前的版本，这个查询只能在联合索引里匹配到名字是 'LiLei' 开头的索引，然后拿这些索引对应的主键逐个回表，到主键索引上找出相应的记录，再比对age和position这两个字段的值是否符合。

`MySQL 5.6`引入了索引下推优化，可以在索引遍历过程中，对索引中包含的所有字段先做判断，过滤掉不符合条件的记录之后再回表，可以有效的减少回表次数。使用了索引下推优化后，上面那个查询在联合索引里匹配到名字是 'LiLei' 开头的索引之后，同时还会在索引里过 滤age和position这两个字段，拿着过滤完剩下的索引对应的主键id再回表查整行数据。

引下推会减少回表次数，对于innodb引擎的表索引下推只能用于二级索引，innodb的主键索引（聚簇索引）树叶子节点上保存的是全行数据，所以这个时候索引下推并不会起到减少查询全行数据的效果。

#### 🎯 alter table T engine=InnoDB
使用`alter table T engine = InnoDB`，Mysql会创建一个新的空表，然后将旧的数据逐行导入到新表中，这个过程中索引会被重建，最后Mysql会删除旧表，并将新表重命名为原表名称。

在一个表里面插入100万的数据，当把这一百万数据删除的时候，发现.ibd文件所占用的空间并没有释放，只要重建索引空间才被释放。

#### 🎯索引有序性的实践
```sql
//表结构
CREATE TABLE `geek` (
  `a` int(11) NOT NULL,
  `b` int(11) NOT NULL,
  `c` int(11) NOT NULL,
  `d` int(11) NOT NULL,
  PRIMARY KEY (`a`,`b`),
  KEY `c` (`c`),
  KEY `ca` (`c`,`a`),
  KEY `cb` (`c`,`b`)
) ENGINE=InnoDB;
```

    公司为了实现如下业务新增了‘ca’、‘cb’联合索引：

1. select * from geek where c=N order by a limit 1;
2. select * from geek where c=N order by b limit 1;

如果c列上的重复率很低的话，两个索引都不用建，因为过滤只剩下几条数据，排序也不影响；**如果c列重复度比较高，就需要建立（c，b）联合索引来消除排序，在大量数据的情况下，排序是个非常耗时的操作**；（c，a）联合索引为什么就不用加呢？虽然从辅助索引c检索到的主键值可能是无序的，但是在“回表”到主键索引检索完整数据行时，由于主键索引的有序性，返回的结果集将自动按照a的顺序排列。因此，不需要额外的排序操作，也就不会出现Using filesort。

例如a_b_c的组合索引，先说规律：a在索引的最前面，肯定是有序的，b在第二个位置，只有在a唯一确定一个值的时候，b才是有序的，如果a有多个值，那么b 将不一定有序，同理，c也是类似。

```java
explain select STKCODE from stock where stkcode = '000001' order by market ;  
explain select STKCODE from stock where stkcode > '000001' order by market ;   会出现Using filesort 
```

#### 🎯默认的查询排序
默认查询是按照使用的索引进行排序的，可以看下面的例子。有一个表t5，主键是id，字段c是普通索引，执行`select *  from t5 where c > 10;`这sql使用了索引c，查询结果如下，可以看出来查询结果不是以主键进行排序，而是根据使用的索引进行排序。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693893321209-69d9dc76-2657-4c6e-adef-0fbf6b743e67.png)

#### 🎯全表扫描
当执行全表扫描时，MySQL 并不是直接从 B+ 树的某个特定位置开始遍历所有叶子节点，而是通过读取表的数据页（Pages）来获取数据。这些数据页包含了实际的数据行，并且它们是按主键顺序组织的（如果存在主键）。

全表扫描通常涉及从磁盘读取多个数据页到内存缓冲池中，然后逐页检查每一条记录是否符合查询条件。

### **1.5 全局锁和表锁**
#### 🎯数据库备份的时候不加全局锁会怎么样？
我们以一个买课程的例子（事务A），account表示用户余额表，course表示用户拥有的课程，开始数据库备份的时候，备份了account表的数据，之后事务A提交了，然后才备份course表的数据，这时候我们会发现，备份中的account表余额没有改变，而备份中的course表却多了新买的课程，这就导致了数据不一致的情况。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693213857181-762544a2-59e8-4e47-ae52-ea51b491fe87.png)

#### 🎯全局锁
全局锁就是对整个数据库实例加锁，命令是`Flush  tables  with  read lock`，当你需要让整个库处于只读状态的时候，可以使用这个命令，之后其他线程的以下语句会被阻塞，数据更新语句、数据定义语句和更新类事务的提交语句，全局锁典型的使用场景就是做全库的逻辑备份。FTWRL前有读写的话，FTWRL都会等待读写执行完毕后才执行，FTWRL执行的时候要刷脏页的数据到磁盘，因为要保持数据的一致性，执行FTWRL的时候是所有的事务提交完毕的时候。

官方自带的逻辑备份工具是mysqldump，当mysqldump使用参数single-transaction的时候，导数据之前会启动一个事务，来确保拿到一致性视图，无论其他操作如何修改数据库，事务内部看到的数据都是一致的，避免了备份过程中由于其他操作导致的数据不一致问题。这也意味着导出数据的同时，其他应用程序依然可以对数据库进行读写操作，这大大提高了数据库的可用性，特别是在需要持续提供服务的生产环境中。

你一定在疑惑，有了这个新功能，为什么还需要FTWRL呢？因为像MyISAM这种不支持事务的引擎，如果备份过程中有更新，总是能读取到最新数据，那么就破坏了一致性，这时候就需要使用FTWRL命令了。

#### 🎯既然全库只读，为啥不使用set global readonly = true
有些系统readonly的值会被用来做其他逻辑，比如判断一个库是主库还是备库，因此修改这个全局变量可能影响会很大。

#### 🎯表级锁
1. 语法`lock tables 表名 read/write`，解锁`unlock tables`。READ：允许其他会话读取但不允许写入（即加共享锁）。WRITE：阻止其他所有会话对该表进行任何读写操作（即加排他锁）。注意这个语法除了会限制别的线程读写之外，也限定了本线程自己的操作。举个例子，sessionA：`lock tables a write`，sessionA去访问t表会报错，它只能访问a表，直到unlock tables，而其他session去访问a表会阻塞，访问t表可以正常访问。
2. 另一类表级锁是MDL（元数据锁），MDL不需要显示的使用，在访问一个表的时候会自动加上，在Mysql5.5版本引入了MDL，对表做增删改查的时候加MDL读锁，当对表结构变更的时候加MDL写锁；读锁之间不互斥，读写锁和写写锁之间是互斥的。

       下面举个例子：

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693216089711-6c623695-9a18-4699-86b4-1ed12c3807a5.png)

sessionA可以加MDL读锁成功，sessionB也可以加MDL读锁成功，这时候SessionC将加MDL写锁就会被阻塞，如果只是SessionC被阻塞还没有关系，后面来的MDL读锁请求都会因为SessionC的阻塞而阻塞，所以这个机制很可能因为一个表把一个库的连接撑满；其实如果sessionA和sessionB快点提交事务就不会卡主了，所以首先要解决的事情就是避免有长事务的时候加MDL写锁。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693218206209-8c9a8a22-c032-401a-8618-d437573a8536.png)

在测试上面案例的过程中，当sessionC获取到MDL写锁之前，后面的SessionD被阻塞的查询语句竟然先执行了，为什么呢？因为Mysql5.6以及更高版本中支持online DDL，就是减少对DML操作的阻塞时间，所以sessionC不会长时间持有MDL写锁会降级为MDL读锁，所以也就是在sessionA、sessionB事务提交之后，sessionC获得MDL写锁之后，在执行过程中降级为MDL读锁，让sessionD可以先执行完，然后sessionC想要升级为MDL写锁的时候，又被阻塞了，因为sessionD还占着MDL读锁。

#### 🎯问题
备份一般都会在备库上执行，你在用–single-transaction方法做逻辑备份的过程中，如果主库上的一个小表做了一个DDL，比如给一个表上加了一列。这时候，从备库上会看到什么现象呢？

1. master对表t的DDL操作传输到slave的时候，mysqldump如果已经备份完了t的数据，此时slave同步DDL操作正常；
2. master对表t的DDL操作传输到slave的时候，mysqldump如果正在备份t的数据，mysqldump会占用t表的MDL读锁，binlog被阻塞，主从延迟；
3. master对表t的DDL操作传输到slave的时候，如果mysqldump已经拿到t表的表结构定义，然后DDL可以正常同步，那么备份导出的时候会报出：Table definition has changed, please retry transaction，mysqldump终止。
4. master对表t的DDL操作传输到slave的时候，如果mysqldump还没有拿到t表的表结构定义，DDL可以正常同步；

### **1.6 死锁**
#### 🎯查看死锁
```java
1、查询是否锁表
show open tables where in_use > 0
2、查询进程
show processlist
3、查询正在锁的事务
select * from information_schema.innodb_locks
4、查看等待锁的事务
select * from information_schema.innodb_lock_waits
```

#### 🎯两阶段锁
在InnoDB事务中，行锁是在需要的时候加上，但并不是在不需要了就立刻释放，而是要等到事务结束时才释放，这个就是两阶段锁协议。

知道这个有什么好处？例如一个事务中，最容易发生锁冲突的sql，应该尽量的往后放。

为什么需要两阶段锁，因为可以解决并发修改数据库时数据一致性的问题，举个例子，事务A修改记录1将a进行加1操作，但是事务A并没有提交，如果这个时候允许事务B也修改记录1，也将a进行加1操作，事务B提交之后，事务A再提交，不过a的值只被增加了1次，所以就存在数据不一致的问题。

#### 🎯死锁检测
在并发执行的系统中，死锁就是两个或者多个事务相互等待对方占用的资源而导致的一种永久性的阻塞状态，当发生死锁问题，没有任何事务能够继续执行直到解决死锁问题。下面是数据库死锁的一个例子：

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693289186491-4ce97a53-85db-4238-9258-bf3dba0b3b34.png)

 当出现死锁的时候，有两种策略：

1. 一是直接进入等待，直到超时，这个超时时间可以通过参数`innodb_lock_wait_timeout`来设置，在InnoDB中，这个参数的默认值是50秒，意味着出现死锁，第一个被锁住的事务需要等待50秒才会超时退出，这个等待时间系统往往是无法接收的；

```java
SHOW VARIABLES LIKE 'innodb_lock_wait_timeout';
```

2. 另一种策略是，发起死锁检测，发现死锁时，主动回滚死锁链中的某一个事务，让其他事务得以执行，将参数`innodb_deadlock_detect`设置为on，默认值本身就是on，这个功能可以快速发现死锁并且处理。但是它是有额外的负担的，如果大量的事务都是对同一行数据的更新，每个事务阻塞都会判断是否是发生了死锁，这期间将会消耗大量的cpu资源，就是开启的话多了一个检测死锁的消耗。

```java
SHOW VARIABLES LIKE 'innodb_deadlock_detect';
```

#### 🎯死锁检测耗费资源，怎么办？
 案例：影院的账户总额，每次大家购买票，都会对影院的总额进行修改，相当于大量的事务操作一行数据

可以将账户总额放到多条记录上，比如10个记录，这样每次给影院账户加金额的时候，随机选择其中一条，这样冲突的概率变成了原来的1/10，也就减少了死锁检测的消耗。

#### 🎯如果你要删除一个表里面前10000行数据
如果你要删除一个表里面前10000行数据，下面有三种办法可以做到：

1. 第一种，直接执行delete from t limit 10000；
2. 第二种，在一个连接中循环执行20次dalete from t limit 500；
3. 第三种，在20个连接中同时执行delete from t limit 500.

方案一事务相对时间较长，则占用锁的时间较长，会导致其他客户端等待时间长；方案二是将多个长事务变成短事务，例如删除前500的时候，那么其他事务可以对后500的数据操作，提供并发性；方案三属于人为制造锁竞争；方案二相对比较好，具体还是看真实的业务场景分析。

### **1.7 MVCC**
#### 🎯“快照”在MVCC里是怎么工作的？
在可重复读隔离级别下，事务开启的时候就创建了“快照”，注意这个快照是基于整个库的，这时你会说看上去不太现实，如果一个库有100G数据，启动一个事务就需要拷贝100G数据作为快照，实际上MVCC的快照并不需要这样做。

其实是因为在RR级别下，事务开启的时候就可以获得当前最小活跃事务版本、最大事务版本+1、当前活跃的事务版本集合、当前事务的事务版本。表中的一行数据可能有多个版本，每个版本有自己的事务版本号。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693294603452-2c24ed4f-8e3c-4826-b08d-5b8bcee0c027.png)

1. 如果落在绿色部分，表示这个版本是已提交的事务，这个数据可见；
2. 如果落入红色部分，表示这个版本是将来启动的事务生成的，这个数据不可见；
3. 如果落入黄色部分，如果数据版本不在未提交事务的集合里面，可见；如果数据版本是当前事务版本，可见；如果数据在未提交事务集合又不是当前事务版本，不可见。

#### 🎯问题
我用下面的表结构和初始化语句作为实验环境，事务隔离级别是可重复读，我要把所有的c和id值相等的c值清零，但是却发现了一个诡异的情况，c的值改不掉，请你构造出这种情况，并说明原理。

```java
mysql> CREATE TABLE `t` (
  `id` int(11) NOT NULL,
  `c` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
insert into t(id, c) values(1,1),(2,2),(3,3),(4,4);
```

确实用下面两个事务，就可以演示出这个“诡异现象”，事务A中明明查出了id和c相等的数据，但是就是修改不成功，因为事务B已经改了c的值，但是由于MVCC版本的原因，事务A看不到事务B的修改，但是修改的时候是进行当前读，判断c和a相等自然就不成立了。其实这个很像cas的乐观锁，判断版本一致才修改成功。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693297504463-7c48708b-63df-4bc7-9f57-75348bdcd268.png)

### **1.8 普通索引和唯一索引应该怎么选择**
假设维护一个市民系统，每个人都有唯一的身份证号，由于身份证字段比较大，不建议把身份证号作为主键，现在有两种选择，要么将id_card字段创建唯一索引，要么创建为普通索引，从性能的角度考虑，下面将从查询方面和更新方面两个角度考虑。

#### 🎯查询过程
假设执行的查询语句是`select id from t where k  = 5`，k字段不重复，可以是普通索引和唯一索引；对于普通索引来说，查找到满足条件的第一个记录，需要查找下一个记录，直到碰到第一个不满足k=5条件的记录；对于唯一索引来说，由于索引定义了唯一性，查到第一个满足条件的记录后，就会停止继续检索。其实这个不同点带来的性能差距是微乎其微的。

InnoDB的数据是按照页为单位读写的，所以说当找到k=5的记录的时候，它所在的数据页就在内存了，对于普通索引来说，在内存继续判断k=5的记录非常快；当然如果k=5这个记录刚好在数据页的最后一个记录，要取下一个记录就得读取下一个数据页了，这个操作会复杂一些；但是一个数据页可以存在的key的个数还是很多的，出现这种概率也是很低的。

所以说在字段不重复的情况下，从查询的角度来看，给它创建普通索引还是唯一索引的性能差别可以忽略不计。

#### 🎯更新过程
在mysql中提供了一种叫做change buffer的优化技术，用于延迟对非唯一索引的更新操作，并且主要用于优化insert操作。change buffer存在于bufferpool中，`SHOW VARIABLES LIKE 'innodb_buffer_pool_size';（单位字节） SHOW VARIABLES LIKE 'innodb_change_buffer_max_size';（单位比例）`。

当需要更新一个非唯一索引的数据的时候，数据页在内存就直接更新数据页，而这个数据页没有在内存中，会先将操作存在change-buffer中，这样就不需要从磁盘读取这个数据页到内存中；在下次查询需要访问这个数据页的时候，先将数据页加载到内存，然后将change-buffer的操作应用到数据页中，这个过程叫做merge，除了访问这个数据页会发生merge操作外，系统的后台线程也会定期merge，数据库正常关闭也会merge。

对于唯一索引来说，由于需要判断是否违反唯一性约束，这必须先把数据页加载到内存，那么就可以直接更新内存的数据页了，没有必要使用到change-buffer。

因此，对于写多读少的业务来说，页面写完之后马上被访问的概率很小，此时change-buffer的效果是最好的，反之，先将更新记录在change-buffer，由于马上的访问又立即触发merge过程，这样不仅没有减少磁盘IO的次数，反而增加了change-buffer的维护代价。change-buffer也是需要持久化的，持久化的操作叫做purge。

所以change-buffer是减少了随机读磁盘IO的消耗，因为只要命中了change-buffer就可以不用去磁盘加载数据到内存了。

#### 🎯问题
change buffer一开始是写内存的，那么如果这个时候机器掉电重启，会不会导致change buffer丢失呢？change buffer丢失可不是小事儿，再从磁盘读入数据可就没有了merge过程，就等于是数据丢失了。会不会出现这种情况呢？

1. change buffer有一部分在内存有一部分在ibdata（系统表空间）。做purge操作，应该就会把change buffer里相应的数据持久化到ibdata。
2. redo log里记录了数据页的修改以及change buffer新写入的信息，如果掉电，持久化的change buffer数据已经purge，不用恢复。主要分析没有持久化的数据，情况又分为以下几种:  
(1)change buffer写入，redo log虽然做了fsync但未commit，binlog未fsync到磁盘，这部分数据丢失；  
(2)change buffer写入，redo log写入但没有commit，binlog以及fsync到磁盘，先从binlog恢复redo log，再从redo log恢复change buffer；  
(3)change buffer写入，redo log和binlog都已经fsync，那么直接从redo log里恢复。

### **1.9 mysql为什么有时候会选错索引**
#### 🎯复现选错索引的过程
1. 先创建table t；

```java
CREATE TABLE `t` (
  `id` int(11) NOT NULL,
  `a` int(11) DEFAULT NULL,
  `b` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `a` (`a`),
  KEY `b` (`b`)
) ENGINE=InnoDB;
```

2. 创建存储过程插入10万数据；

```java
create procedure idata()
begin
  declare i int;
  set i=1;
  while(i<=100000)do
    insert into t values(i, i, i);
    set i=i+1;
  end while;
end;
call idata();
```

3. 开启慢日志；

```java
SET GLOBAL slow_query_log = '1'; //开启慢日志
SET GLOBAL long_query_time = 0; //触发慢日志阈值设置为0，保证一定触发
SET GLOBAL log_queries_not_using_indexes = 1; //没有使用索引也记录慢日志
SET GLOBAL log_output = 'TABLE'; //慢日志输出在table
```

4. 验证（这里索引选择都是正常的）

```java
select * from t where a between 10000 and 20000;  //会走索引a
select * from t force index(a) where a between 10000 and 20000;//强制走索引a
select * from mysql.slow_log; //查看慢日志
```

5. 出现选错索引的案例

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693892801299-6c56a986-65bc-4130-8c1f-d8078c7fc364.png)

 但是我没有复现老师的情况，上面的案例explain执行计划还是会走索引，并没有全表扫描。

#### 🎯优化器的逻辑
MySQL在真正开始执行语句之前，并不能精确地知道满足这个条件的记录有多少条，而只能根据统计信息来估算记录数。这个统计信息就是索引的“区分度”。显然，一个索引上不同的值越多，这个索引的区分度就越好。而一个索引上不同的值的个数，我们称之为“基数”（cardinality）。也就是说，这个基数越大，索引的区分度越好。

可以通过`<font style="color:rgb(53, 53, 53);">show index from tablename;</font>`来查看表里索引的统计信息，cardinality值与数据总行数越接近，表示索引越优秀，区分度越高，存储引擎在执行查询的时候选择该索引的概率越大。

当然影响执行计划的因素很多，例如当查询的范围更大的时候，就会全表扫描，因为会考虑到回表的代价，不如直接全表扫描。扫描行数、排序、临时表都会影响mysql对执行计划的选择。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694334096797-b22064a8-0e57-427b-961e-0728fd86a096.png)

#### 🎯统计信息
```java
//是否启用持久化统计信息功能，默认ON
SHOW VARIABLES LIKE 'innodb_stats_persistent';
//是否自动触发更新统计信息，默认ON
SHOW VARIABLES LIKE 'innodb_stats_auto_recalc';
//指定在估计索引列的基数和其他统计信息时要采样的索引页数，默认20
SHOW VARIABLES LIKE 'innodb_stats_persistent_sample_pages';
//
SHOW VARIABLES LIKE 'innodb_stats_include_delete_marked';

//上面这些是全局的设置，每个表也可以单独设置
CREATE TABLE `t1` (
`id` int(8) NOT NULL auto_increment,
`data` varchar(255),
`date` datetime,
PRIMARY KEY  (`id`),
INDEX `DATE_IX` (`date`)
) ENGINE=InnoDB,
  STATS_PERSISTENT=1,
  STATS_AUTO_RECALC=1,
  STATS_SAMPLE_PAGES=25;
```

#### 🎯analyze table t
统计信息更新，会重新计算表的索引信息，如行数，以帮助查询优化器更好地评估查询成本，ANALYZE TABLE分析后的统计结果会反应到cardinality的值。

MySQL 的查询优化器（Query Optimizer）在决定是否使用索引时，并不是“凭空猜测”，而是基于表的统计信息（statistics） 来估算成本（cost-based optimization），选择“看起来最快”的执行路径。

这些统计信息包括：

| **统计项** | **说明** |
| --- | --- |
| `cardinality`<br/>（基数） | 每个索引列的唯一值数量（比如主键 cardinality ≈ 表行数） |
| 行数估计 | 表中有多少行数据 |
| 数据分布 | 索引值的分布情况（是否均匀） |


有时候索引失效的原因就是统计信息没有及时更新，`ANALYZE TABLE kt_match;`这条命令的作用是：重新采样表的数据，更新索引的统计信息（特别是 cardinality）。

#### 🎯面试说辞
我们第一时间排查了索引是否失效、统计信息是否过期等问题，最终确认：由于每天使用 DELETE 操作清空表，Oracle 并未自动更新表的统计信息。导致优化器仍然基于前一天的‘百万级’数据量进行成本估算，误判为‘全表扫描比索引扫描更高效’，从而放弃了索引。”



我们立即执行了 ANALYZE TABLE kt_match COMPUTE STATISTICS; 和 ANALYZE TABLE kt_matchfeedetail COMPUTE STATISTICS;，强制重新收集表和索引的统计信息。执行后，查询性能立刻恢复正常，执行计划重新选择了正确的索引路径。”



事后我们深入分析发现，DELETE 操作虽然清空了数据，但不会触发 Oracle 自动收集统计信息（尤其是当表结构未变、且没有显式分析时）。而新导入的数据量远小于历史数据量，但优化器‘看不见’这个变化，导致了执行计划偏差。”



为了避免此类问题再次发生，我们在数据加载流程中加入了自动化统计信息收集步骤——即在每天数据导入完成后，自动执行 ANALYZE TABLE ... COMPUTE STATISTICS 或使用 DBMS_STATS.GATHER_TABLE_STATS，确保优化器始终基于最新的数据分布做出最优决策。



```java
SELECT TABLE_NAME, NUM_ROWS, BLOCKS, AVG_ROW_LEN, LAST_ANALYZED
FROM USER_TAB_STATISTICS
WHERE TABLE_NAME = 'KT_MATCH'; -- 替换为你的表名
```

### **1.10 前缀索引**
#### 🎯初探前缀索引
1. 你现在维护一个支持邮箱登录的系统，用户表定义如下：

```java
create table SUser(
ID bigint unsigned primary key,
email varchar(64), 
... 
)engine=innodb; 
```

2. 业务代码中一定存在类似的查询：

`<font style="color:rgb(53, 53, 53);">select f1, f2 from SUser where email='xxx';</font>`

3. 可以给email字段设置为索引，由于mysql支持前缀索引，所以这里建立索引存在两种方案：

```java
alter table SUser add index index1(email);
//只取前面6个字节
alter table SUser add index index2(email(6));
```

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693904551603-b9ab478c-0620-43b4-9389-2276f0559d80.png)

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693904559021-51fda75b-100d-46dc-acb9-45c4f1460498.png)

4. 如果执行`select id,name,email from SUser where email='zhangssxyz@xxx.com';`，索引index1找到‘zhangssxyz@xxx.com’，然后取‘zhangssxyz@xxx.com’对应的下一条，‘zhangsy1998@aaa.com’发现不满足查询就结束了；
5. 如果执行`select id,name,email from SUser where email='zhangssxyz@xxx.com';`，索引index2会找前缀满足‘zhangs’的数据，你会发现都满足，就会增加回表的次数，但是前缀索引是节省空间的；所以使用前缀索引需要定义好长度，保证区分度比较大，例如下面的验证方法。

```java
select count(distinct email) as L from SUser;

select 
  count(distinct left(email,4)）as L4,
  count(distinct left(email,5)）as L5,
  count(distinct left(email,6)）as L6,
  count(distinct left(email,7)）as L7,
from SUser;
```

#### 🎯前缀索引对覆盖索引的影响
例如`select id,email from SUser where email='zhangssxyz@xxx.com';`这句sql，由于只是返回主键id和普通索引email，可以不用回表操作了，但是由于使用了前缀索引，就不得不回表（因为email索引是被截断的，是不完整的），即使index2索引截取了完整的email字段，也还是会回表，因为系统并不确定是否截取了完整的信息。

也就是说前缀索引就用不了索引覆盖对于查询的优化。

#### 🎯如何让前缀索引查询效率提高
1. 使用倒序存储，例如身份证，顺序的时候前缀重复度很高，我们需要后面几位，只能倒序存储了，然后建立前缀索引；

```java
select field_list from t where id_card = reverse('input_id_card_string');
```

2. 使用hash字段，可以在表上再创建一个字段保证身份证的校验码，同时在这个字段上创建索引。每次插入的时候都用crc32()这个函数得到校验码新字段，两个不同的身份证可能获取到相同的校验码，所以查询的时候还要判断id_card是否相同。

```java
alter table t add id_card_crc int unsigned, add index(id_card_crc);

select field_list from t where id_card_crc=crc32('input_id_card_string') 
    and id_card='input_id_card_string'
```

这两种方式都不支持范围查询了，倒序存储的字段上创建的索引是按照倒序字符串的方式排序的，已经没有办法利用索引方式查出身份证号码在[ID_X, ID_Y]的所有市民了。同样地，hash字段的方式也只能支持等值查询。

#### 🎯问题
如果你在维护一个学校的学生信息数据库，学生登录名的统一格式是”学号@gmail.com", 而学号的规则是：十五位的数字，其中前三位是所在城市编号、第四到第六位是学校编号、第七位到第十位是入学年份、最后五位是顺序编号。系统登录的时候都需要学生输入登录名和密码，验证正确后才能继续使用系统。就只考虑登录验证这个行为的话，你会怎么设计这个登录名的索引呢？

可以把15位学号存在在一个bigint的字段里面，把这个字段建立索引，等值查询的时候可以截去后面的‘@gmail.com’进行等值查询，同样这个索引也是支持范围查询的。

### **1.11 脏页**
 在平时的工作中，一条sql正常执行是特别快的，但有时候突然变得特别慢，并且这样的现象很难复现，看上去就像mysql“抖”了一下；出现这个现象的原因很可能是数据库服务正在刷脏页。

#### 🎯什么是脏页
脏页指的是在缓冲池（Buffer Pool）中已经修改，但尚未写回到磁盘的数据页。当数据页在内存中被更新后，该数据页与磁盘上的对应内容就会不一致，此时内存中的数据页就被标记为脏页。

#### 🎯什么时候需要刷脏页
1. redo-log写满了，需要把checkpoint往前推进，留出空间才可以继续写，checkpoint可不是随便往前修改一下位置就可以的。比如图中，把checkpoint位置从CP推进到CP’，就需要将两个点之间的日志（浅绿色部分），对应的所有脏页都flush到磁盘上。之后，图中从write pos到CP’之间就是可以再写入的redo log的区域。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693970663698-f6449552-e33b-488d-b643-d663374b79a9.png)

2. 内存不够用了，Innodb使用bufferpool管理内存。`<font style="color:rgba(0, 0, 0, 0.85);">SHOW VARIABLES LIKE 'innodb_buffer_pool_size';</font>`
3. mysql系统认为“空闲”的时候，也会进行刷盘。
4. mysql服务正常关闭的时候，肯定也要把内存的数据刷盘。

#### 🎯以上四种场景对性能的影响
1. 第一种是“redo log写满了，要flush脏页”，这种情况是InnoDB要尽量避免的。因为出现这种情况的时候，整个系统就不能再接受更新了，所有的更新都必须堵住（包括插入、更新和删除）。MySQL会启动一个内部线程，负责将redo log文件中已经提交的事务应用到数据文件，然后释放相关的redo log空间。这个过程称为"checkpoint"。`show variables like 'innodb_log%';`通过这个参数可以看到日志文件大小的相关定义。
2. 第二种内存不够用了，这时候只能把最久不使用的数据从内存中淘汰，如果是淘汰一个干净页就直接释放内存复用了，但如果是脏页，就需要先刷盘变成干净页之后再复用。在这里有个比较有意思的策略，在准备刷一个脏页的时候，如果旁边的数据页也是脏页，就会一起刷掉，而且这个逻辑还会蔓延；在InnoDB中，`innodb_flush_neighbors` 参数就是用来控制这个行为的，值为1的时候会有上述的“连坐”机制，值为0时表示不找邻居，自己刷自己的。这个优化在机械硬盘时代是很有意义的，可以减少很多随机IO。机械硬盘的随机IOPS一般只有几百，相同的逻辑操作减少随机IO就意味着系统性能的大幅度提升。而如果使用的是SSD这类IOPS比较高的设备的话，我就建议你把innodb_flush_neighbors的值设置成0。因为这时候IOPS往往不是瓶颈，而“只刷自己”，就能更快地执行完必要的刷脏页操作，减少SQL语句响应时间。在MySQL 8.0中，innodb_flush_neighbors参数的默认值已经是0了。

#### 🎯Innodb刷脏页的策略
1. 你要正确地告诉InnoDB所在主机的IO能力，这样InnoDB才能知道需要全力刷脏页的时候，可以刷多快。这就要用到innodb_io_capacity这个参数了，它会告诉InnoDB你的磁盘能力。这个值我建议你设置成磁盘的IOPS。磁盘的IOPS可以通过fio这个工具来测试。
2. innodb_max_dirty_pages_pct_lwm（low water mark）是脏页占缓冲池总页数的最低百分比阈值。当脏页占据的比例低于该阈值时，InnoDB会主动触发后台脏页刷新操作，将脏页写回磁盘。 innodb_max_dirty_pages_pct（high water mark）是脏页占缓冲池总页数的最高百分比阈值。当脏页占据的比例超过该阈值时，InnoDB会暂停用户事务的执行，强制将脏页写回磁盘，以确保脏页的数量不超过一定限制，避免系统性能下降。

#### 🎯问题
 一个内存配置为128GB、innodb_io_capacity设置为20000的大规格实例，正常会建议你将redo log设置成4个1GB的文件。但如果你在配置的时候不慎将redo log设置成了1个100M的文件，会发生什么情况呢？又为什么会出现这样的情况呢？

回答：每次事务提交都要写redo log，如果设置太小，很快就会被写满，也就是下面这个图的状态，这个“环”将很快被写满，write pos一直追着CP，这时候系统不得不停止所有更新，去推进checkpoint。这时，你看到的现象就是磁盘压力很小，但是数据库出现间歇性的性能下跌。

#### 🎯LSN，Log Sequence Number（日志序列号）
在MySQL中，每个数据页确实存储了一个LSN（Log Sequence Number），以跟踪页的日志变化。 LSN的变化是在数据页被修改时发生的。当数据页被修改后，系统会分配一个新的LSN，并将其写入到数据页的页头中。这个LSN表示数据页上的最新修改。具体来说，对于每个修改操作（如插入、更新、删除等），系统会生成日志记录，该记录也有一个唯一的LSN。在数据页被修改后，系统会将这个LSN写入数据页，以表示最新的日志记录。 需要注意的是，不同数据库管理系统的LSN使用方式可能有所不同，而MySQL中的LSN是通过递增的方式生成的。在MySQL中，LSN递增的频率取决于发生的事务以及对数据页的修改操作。这些操作会引起LSN的增加，以及相应的日志记录。 总之，LSN的变化用于跟踪数据页的日志记录和修改操作，以保证数据的一致性和持久性。这使得在系统故障后能够利用LSN来恢复数据。

      `show engine innodb status;`可以查看LSN的大小：

+ log sequence number: 代表当前的重做日志redo log(in buffer)在内存中的LSN
+ log flushed up to: 代表刷到redo log file on disk中的LSN
+ pages flushed up to: 代表已经刷到磁盘数据页上的LSN
+ last checkpoint at: 代表上一次检查点所在位置的LSN

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694240256207-099e61eb-272e-4ccf-bcb9-befe5830400b.png)

#### 🎯如何判断脏页
只需要判断这个页面的LSN值，如果数据的页面的LSN值大于checkpoint的LSN值，说明这个数据页接受了新的更新，那么这个页面就是脏页。

#### 🎯mysql如何基于checkpoint从crash中恢复
读取redo log，从checkpoint LSN开始，顺序读取redo log中的记录，每一条redo log都包含一个LSN，InnoDB会解析并执行相应的数据变更操作，通过重新应用这些变更，InnoDB能够将数据库恢复到奔溃之前的状态，在恢复过程中，redo log还会结合bin log处理那些未完成的事务，继续提交或者回滚这些事务，以保证数据一致性。

:::warning
收集好问好答

:::

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1693981669386-18226585-93d4-4e3f-98bb-d63822c2e159.png)

### **1.12 为什么表数据删掉一半，表文件大小不变**
:::warning
innodb_file_per_table参数

:::

表数据可以存在于共享表空间，也可以是单独的文件，这个行为由参数innodb_file_per_table控制，这个参数设置为OFF表示表数据存放在共享表空间，也就是和字典放在一起；这个参数ON表示每个innodb表数据存储在一个以.ibd为后缀的文件中。

从mysql5.6.6版本开始，它的默认值就是ON，也推荐将这个值设置为ON；因为一个表单独存在于一个文件更容易管理，drop table命令可以直接删除这个文件，而如果在共享表空间，即使表删除了，空间也不会被回收。



:::warning
删除数据行

:::

在mysql中，delete命令其实只是把记录的位置，或者数据页的位置标记为“可复用”，但磁盘文件的大小是不会变的，通过delete命令是不会回收表空间的，我们可以验证这个结论，删除了表数据，查看对应表的ibd文件可以发现，文件的大小没有任何变化。

如果想要回收空间怎么办？可以重建表，可以建一个与原表结构相同的表，然后把数据一行行插入新表，这样新表对数据页的利用率更高，在mysql中可以使用命令完成上述的操作，`<font style="color:rgb(53, 53, 53);">alter table A engine=InnoDB</font>`<font style="color:rgb(53, 53, 53);">，通过这个命令mysql可以自动完成转存数据、交换表名、删除旧表的操作。</font>

<font style="color:rgb(53, 53, 53);"></font>

:::warning
重建表

:::

整个重建表的过程`alter table t engine=innodb;`，插入数据的过程是最为耗时的，在这个过程中，原表不能有数据的更新，这个DDL过程不是Online的。这种复制方式也可以表示成：`alter table t engine=innodb,ALGORITHM=copy;`是一种copy的方式（创建临时表去复制数据，然后改表名）。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694007423060-8a2871d6-2311-4653-afdb-cb3e07a72465.png)

**而从mysql5.6版本开始引入了online DDL，下面简述一下Online DDL的重建过程：**

1. 建立一个临时文件，扫描表A主键所在数据页；
2. 用数据页中表A的记录生产B+树，存储在临时文件；
3. 生产临时文件的过程中，将所有对表A的操作记录在一个日志文件中(row log)，对于图中state2的状态；
4. 临时文件生成后，将日志文件应用到临时文件，得到一个逻辑数据和表A相同的数据文件，对于的就是图中state3的状态；
5. 用临时文件替换表A的数据文件。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694007810048-02e416da-b849-49c6-a3a4-7466aa5ca0df.png)

这种重建表的方式`alter table t engine=innodb`，也可以表示成`alter table t engine=innodb,ALGORITHM=inplace;`（因为这种方式没有复制数据到临时表，但是和copy一样都是要占用临时空间的）。但不代表使用inplace就是online DDL，DDL过程如果是online的，那么一定是inplace的，反过来未必，截止到mysql8.0，添加全文索引和空间索引就不是online的，但是inplace的。



:::warning
问题

:::

假设现在有人碰到了一个“想要收缩表空间，结果适得其反”的情况，看上去是这样的，你觉得可能是什么原因呢 ？

1. 一个表t文件大小为1TB；
2. 对这个表执行 alter table t engine=InnoDB；
3. 发现执行完成后，空间不仅没变小，还稍微大了一点儿，比如变成了1.01TB。

回答：表t本身的数据页利用率就很高了，加上重建表的过程中，刚好有DML操作在执行，这期间可能会导致页的利用率降低，导致文件大小还扩大了。



:::warning
评论区精彩问答

:::

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694008549245-be12343d-632b-4042-9313-ffa253de2212.png)

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694008646975-b10d84ef-3b45-4f14-ac8f-cb32bf883020.png)

### **1.13 count(*)这么慢，我该怎么办**
:::warning
count(*)的实现方式

:::

在mysql不同的存储引擎中，count(*)的实现方式是不一样的；MyISAM引擎把一个表的总行数存在了磁盘上，因此执行count(*)的时候会直接返回这个数，效率很高，但是如果加了where条件，MyISAM也是不能返回这么快的；而Innodb引擎在执行count(*)的时候，需要读取数据行，然后累加计数。

你知道的，InnoDB是索引组织表，主键索引树的叶子节点是数据，而普通索引树的叶子节点是主键值。所以，普通索引树比主键索引树小很多。对于count(*)这样的操作，遍历哪个索引树得到的结果逻辑上都是一样的。因此，MySQL优化器会找到最小的那棵树来遍历。所以count(id)走的可能也是普通索引，而不是主键索引。



:::warning
在数据库保存计数

:::

为了解决count(*)查询慢的问题，可以用一张单独的表保存表的count统计值。这样做有什么好处呢？

1. Innodb是支持奔溃的时候数据一致性的问题；
2. 由于Innodb支持事务的隔离性，插入操作和count+1的操作要么全部成功，要么全部失败，对于其他事务也是隔离的，保证了一致性。



:::warning
不同的count用法

:::

1. 逻辑层面，count(*)、count(主键id)、count(1)都表示满足where条件的结果集总行数；而count(字段)，满足where条件的同时，字段值不为null的总个数。
2. 性能层面，要记住几个原则，server层要什么就给什么；Innodb只给必须要的值；优化器只优化了count(*)的语意为“取行数”，其他的count(x)没有优化。
3. 对于count(主键)来说，InnoDB引擎会遍历整张表，把每一行的id值都取出来，返回给server层。server层拿到id后，判断是不可能为空的，就按行累加。
4. 对于count(1)来说，InnoDB引擎遍历整张表，但不取值。server层对于返回的每一行，放一个数字“1”进去，判断是不可能为空的，按行累加。单看这两个用法的差别的话，你能对比出来，count(1)执行得要比count(主键id)快。因为从引擎返回id会涉及到解析数据行，以及拷贝字段值的操作。
5. 对于count(字段)来说：如果这个“字段”是定义为not null的话，一行行地从记录里面读出这个字段，判断不能为null，按行累加；如果这个“字段”定义允许为null，那么执行的时候，判断到有可能是null，还要把值取出来再判断一下，不是null才累加。
6. 但是count(*)是例外，并不会把全部字段取出来，而是专门做了优化，不取值。count(*)肯定不是null，按行累加。

所以结论是：按照效率排序的话，count(字段)<count(主键id)<count(1)≈count(*)，所以我建议你，尽量使用count(*)。



:::warning
问题

:::

在刚刚讨论的方案中，我们用了事务来确保计数准确。由于事务可以保证中间结果不被别的事务读到，因此修改计数值和插入新记录的顺序是不影响逻辑结果的。但是，从并发系统性能的角度考虑，你觉得在这个事务序列里，应该先插入操作记录，还是应该先更新计数表呢？

回答：应该先插入操作记录，因为所有的相关事务都会更新计数表涉及到锁的冲突，死锁的检测也会耗时，如果冲突了且插入操作记录后插入，就会出现插入记录操作一直等待，所有应该先插入操作记录。

### **1.14 日志和索引相关问题**
:::warning
业务设计问题

:::

业务上有这样的需求，A、B两个用户如果相互关注，则成为好友；设计上有两张表，一个是like表，一个是friend表。下面是表结构：

```java
CREATE TABLE `like` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `liker_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_id_liker_id` (`user_id`,`liker_id`)
) ENGINE=InnoDB;

CREATE TABLE `friend` (
  id` int(11) NOT NULL AUTO_INCREMENT,
  `friend_1_id` int(11) NOT NULL,
  `firned_2_id` int(11) NOT NULL,
  UNIQUE KEY `uk_friend` (`friend_1_id`,`firned_2_id`)
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
```

 ![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694248321246-7e9362b2-78b7-4925-a110-f5166cb40e1b.png)

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694248532585-95139d63-0dd6-4452-a43d-08078e7f447a.png)但是如果A、B两个用户同时关注对方，会出现不会成为好友的情况。因为上面的第一步，双方都没有关注对方，第一步即使使用了排它锁，因为记录不存在，行锁无法生效，请问这种情况，在Mysql锁层面有没有办法处理？

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694269689039-ebc85766-77f4-4301-b914-711c21e86b10.png)



:::warning
问题

:::

 创建一个简单的表t，并插入一行，然后对这行进行修改。

```java
CREATE TABLE `t` (
`id` int(11) NOT NULL primary key auto_increment,
`a` int(11) DEFAULT NULL
) ENGINE=InnoDB;
insert into t values(1,2);
```

这时候，表t里有唯一的数据(1,2)。假设，我现在要执行：

```java
update t set a=2 where id=1;
```

你会看到这样的结果，结果显示匹配了一行，修改了0行。可以使用`SHOW ENGINE INNODB STATUS;`命令查看LSN的变化，发现LSN压根没有变。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694270534437-212b511c-a772-4df2-852f-70381d1d7c66.png)



**答案：**

1. sessionA第一次查询出来是(1,2)，但是执行完修改操作之后，查询出来的数据是(1,3)，由于快照读，sessionA不可能读到别的事务修改的数据，所以数据只能是sessionA自己修改的。注意这里要设置binlog_row_image参数为MINIMAL，记住要在my.ini文件中修改，并且重启mysql数据库。**当参数为MINIMAL的时候**，binlog只会记录id=1，以及被更新的列a=3，所以我们只有id = 1这个信息，并不能判断出a = 3其实是没有变化的，所以sessionA还是执行了一次变更，以至于sessionA最后一次查询可以查询出(1,3)。前提条件，binlog_format参数为row，binlog是记录row的变更信息在日志中。
2. 如果这里的binlog_row_image为FULL，binlog日志需要记录全部字段的变更，那么sessionA这次update操作就不会执行了，因为获取了全部的字段，通过对比发现set a = 3和原记录值一模一样，不需要浪费时间去修改它，那么sessionA最后一次查询就是(1,2)。前提条件，binlog_format参数为row，binlog是记录row的变更信息在日志中。
3. 还有一种情况，**当binlog_format参数为STATEMENT的时候**，这时候binlog记录的是sql语句，已经不会记录字段的变更了，当update的where是id = 1，它只知道id=1无法判断a = 3，所以会update生效，sessionA最后一次查询结果是(1,3)；而使用`update t set a=3 where id=1 and a=3;`来更新，知道了id = 1且a = 3，就可以判断出这次修改是没有任何意义的，update也就不会生效，sessionA最后一次查询结果是(1,2)。

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694274376664-dbaa4695-972d-4d60-8848-199951dee184.png)

![](https://cdn.nlark.com/yuque/0/2023/png/32520881/1694279061911-88fa783c-631a-4154-bea3-396b920b8500.png)





