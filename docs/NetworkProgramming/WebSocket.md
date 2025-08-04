## 1. 初识WebSocket


### 1.1 简介<font style="color:rgb(44, 44, 54);"> </font><font style="color:rgb(44, 44, 54);">📝</font>
WebSocket是html5规范中的一个部分，它借鉴了socket这种思想，为web应用程序客户端和服务端之间提供了一种全双工通信机制。同时，它又是一种新的应用层协议，WebSocket协议是为了提供web应用程序和服务端全双工通信而专门制定的一种应用层协议，通常它表示为：ws://echo.websocket.org/?encoding=text HTTP/1.1，可以看到除了前面的协议名和http不同之外，它的表示地址就是传统的url地址。



### 1.2 WebSocket机制<font style="color:rgb(44, 44, 54);"> </font><font style="color:rgb(44, 44, 54);">📝</font>
WebSocket 是 HTML5 一种新的协议。它实现了浏览器与服务器全双工通信，能更好的节省服务器资源和带宽并达到实时通讯，它建立在 TCP 之上，同 HTTP 一样通过 TCP 来传输数据，但是它和 HTTP 最大不同是：

1. WebSocket 是一种双向通信协议，在建立连接后，WebSocket 服务器和 Browser/Client Agent 都能主动的向对方发送或接收数据，就像 Socket 一样；
2. WebSocket 需要类似 TCP 的客户端和服务器端通过握手连接，连接成功后才能相互通信。

**非 WebSocket 模式传统 HTTP 客户端与服务器的交互如下图所示：**

![](/WebSocket/1.jpg)

**使用 WebSocket 模式客户端与服务器的交互如下图：**

![](/WebSocket/2.jpg)

上图对比可以看出，相对于传统 HTTP 每次请求-应答都需要客户端与服务端建立连接的模式，WebSocket 是类似 Socket 的 TCP 长连接的通讯模式，一旦 WebSocket 连接建立后，后续数据都以帧序列的形式传输。在客户端断开 WebSocket 连接或 Server 端断掉连接前，不需要客户端和服务端重新发起连接请求。在海量并发及客户端与服务器交互负载流量大的情况下，极大的节省了网络带宽资源的消耗，有明显的性能优势，且客户端发送和接受消息是在同一个持久连接上发起，实时性优势明显。

在客户端，new WebSocket 实例化一个新的 WebSocket 客户端对象，连接类似 ws://yourdomain:port/path 的服务端 WebSocket URL，WebSocket 客户端对象会自动解析并识别为 WebSocket 请求，从而连接服务端端口，执行双方握手过程。

**客户端发送数据格式类似于下面的内容：**

```plain
GET /webfin/websocket/ HTTP/1.1
Host: localhost
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: xqBt3ImNzJbYqRINxEFlkg==
Origin: http://localhost:8080
Sec-WebSocket-Version: 13
```

可以看到，客户端发起的 WebSocket 连接报文类似传统 HTTP 报文，upgrade是HTTP1.1中用于定义转换协议的header域。它表示，如果服务器支持的话，客户端希望使用现有的「网络层」已经建立好的这个「连接（此处是TCP连接）」，切换到另外一个「应用层」（此处是WebSocket）协议；“Sec-WebSocket-Key”是 WebSocket 客户端发送的一个 base64 编码的密文，要求服务端必须返回一个对应加密的“Sec-WebSocket-Accept”应答，否则客户端会抛出“Error during WebSocket handshake”错误，并关闭连接。

**服务端收到报文后返回的数据格式类似于如下内容：**

```plain
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: K7DJLdLooIwIG/MOpvWFB3y3FE8=
```

“Sec-WebSocket-Accept”的值是服务端采用与客户端一致的密钥计算出来后返回客户端的,“HTTP/1.1 101 Switching Protocols”表示服务端接受 WebSocket 协议的客户端连接，经过这样的请求-响应处理后，客户端服务端的 WebSocket 连接握手成功, 后续就可以进行 TCP 通讯了。

<font style="color:rgb(47, 47, 47);"></font>

### 1.3 WebSocket代码实现 📝
<font style="color:rgb(44, 44, 54);">📁</font>**完整代码位置：**`java-learning`模块的`websocket-module`子模块。

```java
@ServerEndpoint("/ws/{userId}")
@Component
public class UnifiedWebSocket {

    private static final Logger logger = LoggerFactory.getLogger(UnifiedWebSocket.class);
    private static final ConcurrentHashMap<String, UnifiedWebSocket> connections = new ConcurrentHashMap<>();
    private Session session;
    private String userId;

    @OnOpen
    public void onOpen(Session session, @PathParam("userId") String userId) {
        this.session = session;
        this.userId = userId;
        connections.put(userId, this);

        logger.info("用户 [{}] 连接成功", userId);
    }

    @OnMessage
    public void onMessage(String message, Session session) {
        logger.info("收到客户端消息: {}", message);
    }

    @OnClose
    public void onClose() {
        connections.remove(userId);
        logger.info("用户 [{}] 断开连接", userId);
    }

    @OnError
    public void onError(Session session, Throwable throwable) {
        logger.error("WebSocket 错误: 用户 [{}]", userId, throwable);
        connections.remove(userId);
    }

    public void sendMessage(WsMessage<?> message) {
        if (session == null || !session.isOpen()) {
            logger.warn("尝试向已关闭的会话发送消息: {}", userId);
            return;
        }
        try {
            // 因为 WebSocket 类本身不是由 Spring 创建的（而是由容器如 Tomcat 创建的），所以不能直接使用 @Autowired 注入 Bean。
            session.getBasicRemote().sendText(SpringContextUtils.getBean(com.fasterxml.jackson.databind.ObjectMapper.class).writeValueAsString(message));
        } catch (Exception e) {
            logger.error("发送消息失败: {}", userId, e);
        }
    }

    public static void sendToUser(String userId, WsMessage<?> message) {
        UnifiedWebSocket socket = connections.get(userId);
        if (socket != null) {
            socket.sendMessage(message);
        } else {
            logger.warn("用户 {} 不在线", userId);
        }
    }

    public static void broadcast(WsMessage<?> message) {
        connections.forEach((id, socket) -> socket.sendMessage(message));
    }

}
```

<font style="color:rgb(44, 44, 54);">📌</font>**核心要点：**

1. @Component 默认确实是单例的（singleton 作用域），这意味着 Spring 容器中只会创建一个UnifiedWebSocket 实例。但是，在 WebSocket 场景下，这个行为会被覆盖。
2. 当使用 @ServerEndpoint 注解时，WebSocket 容器（如 Tomcat 的 WebSocket 实现）会负责创建和管理 WebSocket 端点实例。
3. 默认情况下，WebSocket 端点实例是 每个连接一个实例（即多例的），而不是遵循 Spring 的单例模式。
4. 每当有新的 WebSocket 连接建立时，WebSocket 容器会通过反射创建一个新的 UnifiedWebSocket 实例。这个实例与 Spring 容器中的单例无关，是独立创建的。
5. @Component 注解确保 UnifiedWebSocket 类可以注入其他 Spring 管理的 bean，使 UnifiedWebSocket 能够利用 Spring 的其他功能和服务，帮助 Spring 和 WebSocket 容器协同工作，尽管实例化主要由 WebSocket 容器完成

### 1.4 WebSocket协议 📝
```plain
   0                   1                   2                   3
   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
  +-+-+-+-+-------+-+-------------+-------------------------------+
  |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
  |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
  |N|V|V|V|       |S|             |   (if payload len==126/127)   |
  | |1|2|3|       |K|             |                               |
  +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
  |     Extended payload length continued, if payload len == 127  |
  + - - - - - - - - - - - - - - - +-------------------------------+
  |                               |Masking-key, if MASK set to 1  |
  +-------------------------------+-------------------------------+
  | Masking-key (continued)       |          Payload Data         |
  +-------------------------------- - - - - - - - - - - - - - - - +
  :                     Payload Data continued ...                :
  + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
  |                     Payload Data continued ...                |
  +---------------------------------------------------------------+
```

WebSocket协议是一种基于TCP的网络协议，用于在客户端和服务器之间建立持久连接，实现全双工通信。以下是WebSocket协议中数据帧的字段内容及解释，以表格形式展示：

| **字段** | **长度（比特）** | **说明** |
| --- | --- | --- |
| FIN | 1 | 标识当前帧是否为消息的最后一帧。1表示消息结束帧，0表示消息还有后续帧。 |
| RSV1, RSV2, RSV3 | 各1 | 保留位，为协议扩展预留。默认值必须为0，否则接收方应断开连接。 |
| Opcode | 4 | 操作代码，决定了应该如何解析后续的数据载荷。例如：   %x0：表示一个延续帧。   %x1：表示这是一个文本帧。   %x2：表示这是一个二进制帧。   %x8：表示连接断开。   %x9：表示这是一个ping操作。   %xA：表示这是一个pong操作。 |
| Mask | 1 | 表示是否要对数据载荷进行掩码操作。从客户端向服务端发送数据时，Mask为1；从服务端向客户端发送数据时，Mask为0。掩码操作是为了防止恶意脚本攻击（如跨站脚本攻击，XSS）。通过随机掩码密钥对数据进行混淆，使攻击者无法直接预测或构造合法的WebSocket帧。 |
| Payload length | 7，或7+16，或1+64 | 数据载荷的长度，单位是字节。x为0~126：数据的长度为x字节。x为126：后续2个字节代表一个16位的无符号整数，该无符号整数的值为数据的长度。x为127：后续8个字节代表一个64位的无符号整数（最高位为0），该无符号整数的值为数据的长度。 |
| Masking-key | 0或32（当Mask为1时） | 当Mask为1时存在，为4字节随机密钥。掩码算法为C[i] = P[i] ^ M[i % 4]，接收方使用相同密钥进行解掩码。 |
| Payload data | 载荷数据长度减去扩展数据长度 | 包括了扩展数据、应用数据。扩展数据：如果没有协商使用扩展的话，扩展数据为0字节。应用数据：任意的应用数据，在扩展数据之后（如果存在扩展数据），占据了数据帧剩余的位置。 |


## 2. HTTP 与 WebSocket
### 2.1 HTTP协议基础 📝
**HTTP的地址格式如下（协议和host不分大小写）：**

```plain
http_URL = "http:" "//" host [ ":" port ] [ abs_path [ "?" query ]]
```

### 2.2 HTTP消息 📝
一个HTTP消息可能是request或者response消息，两种类型的消息都是由开始行（start-line），零个或多个header域，一个表示header域结束的空行（也就是，一个以CRLF为前缀的空行），一个可能为空的消息主体（message-body）。一个合格的HTTP客户端不应该在消息头或者尾添加多余的CRLF，服务端也会忽略这些字符。

header的值不包括任何前导或后续的LWS（线性空白），线性空白可能会出现在域值（field-value）的第一个非空白字符之前或最后一个非空白字符之后。前导或后续的LWS可能会被移除而不会改变域值的语意。任何出现在field-content之间的LWS可能会被一个SP（空格）代替。header域的顺序不重要，但建议把常用的header放在前边。

### 2.3 HTTP的Request消息 📝
一个HTTP的request消息以一个请求行开始，从第二行开始是header，接下来是一个空行，表示header结束，最后是消息体。

Request消息中使用的header可以是general-header或者request-header。其中有一个比较特殊的就是Host，Host会与reuqest Uri一起来作为Request消息的接收者判断请求资源的条件。

**请求资源组织方法如下：**

1. 当客户端发送的请求 URI 是完整的 URL（包含协议和主机名），那么主机名就直接从 URI 提取，而不再使用 Host 头中的值。
2. 如果请求的 URI 是相对路径（如 /index.html），那主机信息就必须通过 Host 请求头提供，否则服务器无法判断你要访问的是哪一个虚拟主机。
3. 无论主机是从 Request-URI 还是 Host 头中提取的，如果这个主机名无效、不存在或格式不正确，服务器应该返回 HTTP 状态码 400 Bad Request，表示客户端发送了非法请求。

**举例：**

```plain
GET http://www.example.com/index.html HTTP/1.1
Host: www.another.com
```

在这种情况下，虽然有 `Host: www.another.com`，但因为 Request-URI 是绝对地址 `http://www.example.com/index.html`，所以 实际访问的是 `www.example.com`，`Host` 头会被忽略。

**<font style="color:rgb(44, 44, 54);"></font>**

```plain
GET /index.html HTTP/1.1
Host: www.example.com
```

在这个例子中，URI 是相对路径 `/index.html`，所以必须通过 `Host: www.example.com` 来告诉服务器你想要访问的是哪个站点。

<font style="color:rgb(44, 44, 54);"></font>

```plain
GET http://invalid-host-name-that-does-not-exist.com/page HTTP/1.1

// 或是

GET /page HTTP/1.1
Host: invalid-host-name-that-does-not-exist.com

// 在这两种情况中，如果服务器解析出的主机名无法识别或 DNS 解析失败，它应该返回：

HTTP/1.1 400 Bad Request
Content-Type: text/html

The requested host is invalid.
```

### 2.4 HTTP的Response消息 📝
除了header不使用request-header之外，只有第一行不同，响应消息的第一行是状态行，其中就包含大名鼎鼎的返回码。

第一行的内容首先是协议的版本号，然后跟着返回码，最后是解释的内容，它们之间各有一个空格分隔，行的末尾以一个回车换行符作为结束。

### 2.5 HTTP的R返回码 📝
| **状态码范围** | **分类名称** | **含义说明** | **常见状态码及含义说明** |
| --- | --- | --- | --- |
| **1xx** | Informational | 请求已接收，正在处理中。这类状态码是临时响应，表示服务器还在继续处理请求。 | `100 Continue`：客户端应继续发送请求剩余部分<br/>`101 Switching Protocols`：服务器根据客户端请求切换协议（如升级到 WebSocket） |
| **2xx** | Success | 请求成功接收、理解和处理。 | `200 OK`：请求成功，返回所需的数据<br/>`201 Created`：请求成功并在服务器上创建了新资源<br/>`204 No Content`：请求成功但无返回内容 |
| **3xx** | Redirection | 需要进一步操作才能完成请求，通常用于重定向。 | `301 Moved Permanently`：永久移动到新 URL<br/>`302 Found`：临时重定向 <br/>`304 Not Modified`：资源未修改，可使用缓存版本 |
| **4xx** | Client Error | 客户端发送的请求有误，服务器无法处理。 | `400 Bad Request`：请求语法错误<br/>`401 Unauthorized`：缺少有效身份验证凭证<br/>`403 Forbidden`：服务器拒绝执行请求<br/>`404 Not Found`：请求的资源不存在 |
| **5xx** | Server Error | 服务器在处理请求时发生错误，尽管请求本身是合法的。 | `500 Internal Server Error`：服务器内部错误<br/>`501 Not Implemented`：服务器不支持该请求功能<br/>`502 Bad Gateway`：作为网关或代理时收到无效响应<br/>`503 Service Unavailable`：服务器暂时无法处理请求 |


### 2.6 HTTP的消息体（Message Body）和实体主体（Entity Body） 📝
✅**如果有 Transfer-Encoding 头，那么消息体解码完了就是实体主体。**

+ 如果使用了 Transfer-Encoding: chunked 等方式传输数据，接收方需要先对消息体进行解码。
+ 解码完成后，得到的就是实体主体（也就是客户端真正要发送的内容）。

```plain
POST /api/data HTTP/1.1
Host: example.com
Transfer-Encoding: chunked

7\r\n
Hello w\r\n
6\r\n
orld!\r\n
0\r\n
\r\n
```

+ 消息体是经过 chunked 编码的数据；
+ 接收方解码后得到的是完整的字符串 "Hello world!"，这就是实体主体。



✅**如果没有 Transfer-Encoding 头，消息体就是实体主体。**

+ 如果没有使用 Transfer-Encoding，而是直接通过 Content-Length 指定了长度，那么消息体就是原始内容本身，不需要额外解码。

```plain
POST /api/data HTTP/1.1
Host: example.com
Content-Length: 12

Hello world!
```

+ 消息体就是 "Hello world!"
+ 它同时也是实体主体，因为没有使用任何编码方式。



✅**在 request 消息中，消息头中含有 Content-Length 或者 Transfer-Encoding，标识会有一个消息体跟在后边。**

+ 只要请求头里出现了 `Content-Length` 或 `Transfer-Encoding`，就表示接下来会有消息体；
+ 这是服务器用来判断是否需要等待和读取 body 的依据。

```plain
POST /submit HTTP/1.1
Host: example.com
Content-Length: 15

{"name":"Alice"}
```

+ 有 `Content-Length` → 表示有消息体
+ 服务器会读取 15 字节的数据作为 body



✅**如果请求的方法不应该含有消息体（如 OPTIONS），那么 request 消息一定不能含有消息体，即使客户端发送过去，服务器也不会读取消息体。**

+ 有些 HTTP 方法（如 `OPTIONS`, `GET`, `HEAD`）**按规范不应包含消息体**
+ 即使客户端发了 body，服务器也应忽略它

```plain
GET /index.html HTTP/1.1
Host: example.com
Content-Length: 5

hello
```

+ 虽然客户端发了一个 GET 请求并附带了 body `"hello"`
+ 但服务器应该忽略这个 body，因为它不符合语义规范



✅**在 response 消息中，是否存在消息体由请求方法和返回码来共同决定。**

```plain
GET /page.html HTTP/1.1
Host: example.com

HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 100

<html><body>...</body></html>
```

+ `200 OK` 通常有 body



```plain
HTTP/1.1 204 No Content
Date: Mon, 01 Jan 2025 12:00:00 GMT
```

+ `204 No Content` 表示没有 body



```plain
HTTP/1.1 304 Not Modified
Date: Mon, 01 Jan 2025 12:00:00 GMT
```

+ `304 Not Modified` 也没有 body



```plain
HTTP/1.1 100 Continue
```

+ `1xx` 类型的响应也不允许有 body

### 2.7 HTTP的消息长度 📝
✅**所有不应该返回内容的Response消息都不应该带有任何的消息体，消息会在第一个空行就被认为是终止了；**

****

✅**如果消息头含有Transfer-Encoding，且它的值不是identity，那么消息体的长度会使用chunked方式解码来确定，直到连接终止；**

因为 chunked 编码本身不依赖 `Content-Length`，接收方无法提前知道整个 body 有多大。它只能不断地读取每个 chunk，直到遇到 `0\r\n\r\n` 结束标识。

```plain
HTTP/1.1 200 OK
Content-Type: text/plain
Transfer-Encoding: chunked

7\r\n
Mozilla\r\n
9\r\n
Developer\r\n
0\r\n
\r\n
```

_**客户端解析过程：**_

1. 读取第一行 `7\r\n` → 表示接下来有 7 字节的内容
2. 读取 `Mozilla\r\n` → 得到 `"Mozilla"`
3. 读取 `9\r\n` → 接下来是 9 字节的内容
4. 读取 `Developer\r\n` → 得到 `"Developer"`
5. 读取 `0\r\n` → 表示所有 chunk 已经读完
6. 最后的 `\r\n` 是结束标志

_**实体主体结果：**_

```plain
MozillaDeveloper
```

****

✅**如果消息头中有Content-Length，那么它就代表了entity-length和transfer-length。如果同时含有Transfer-Encoding，则entity-length和transfer-length可能不会相等，那么Content-Length会被忽略；**

+ 如果只有 `Content-Length`，那它既表示实体长度也表示传输长度。
+ 如果同时存在 `Content-Length` 和 `Transfer-Encoding`（如 `chunked`），说明消息体是经过编码传输的：
    - 此时，传输长度 ≠ 实体长度
    - HTTP 协议规定：在这种情况下，必须忽略 `Content-Length`，只用 `Transfer-Encoding` 来判断消息体长度

****

✅**如果消息的媒体类型是multipart/byteranges，并且transfer-length也没有指定，那么传输长度由这个媒体自己定义。通常是收发双方定义好了格式， HTTP1.1客户端请求里如果出现Range头域并且带有多个字节范围（byte-range）指示符，这就意味着客户端能解析multipart/byteranges响应；**

****

✅**如果是Response消息，也可以由服务器来断开连接，作为消息体结束。**

****

### 2.8 长连接 📝
如果你使用Socket来建立TCP的长连接，那么这个长连接跟我们这里要讨论的WebSocket是一样的，实际上TCP长连接就是WebSocket的基础。

但是如果是HTTP的长连接，本质上还是Request/Response消息对，仍然会造成资源的浪费、实时性不强等问题。



### 2.9 WebSocket协议Uri 📝
```plain
ws-URI = "ws:" "//" host [ ":" port ] path [ "?" query ]
wss-URI = "wss:" "//" host [ ":" port ] path [ "?" query ]
```

注：wss协议是WebSocket使用SSL/TLS加密后的协议，类似于HTTP和HTTPS的关系。



### 2.10 WebSocket与HTTP1.1协议的区别 📝
✅**关键相同点**

| **特性** | **说明** |
| --- | --- |
| **基于 TCP** | 都使用 TCP 协议进行可靠传输 |
| **运行在应用层** | 都是 OSI 模型中的应用层协议 |
| **支持文本和二进制数据** | 都可以传输文本（如 JSON）和二进制数据 |
| **握手阶段使用 HTTP/1.1** | WebSocket 的初始连接建立是通过 HTTP/1.1 完成的（Upgrade 头） |




✅**关键不同点**

| **对比维度** | **HTTP/1.1** | **WebSocket** |
| --- | --- | --- |
| **通信模式** | 请求-响应，客户端发起请求，服务器响应后连接关闭 | 全双工，客户端和服务器可以同时发送和接收消息 |
| **连接保持** | 短连接，一次请求响应完成后连接关闭（除非使用 `Connection: keep-alive`） | 长连接，一旦建立，连接保持打开状态，直到主动关闭 |
| **延迟** | 较高，每次请求都要重新建立或复用连接 | 极低，建立连接后可随时双向通信，无请求-响应延迟 |
| **协议标识符** | `http://`<br/> 或 `https://` | `ws://`<br/> 或 `wss://` |
| **头部信息** | 每次请求都携带完整的 header | 握手阶段使用 HTTP header，之后通信无 header |
| **适用场景** | 页面加载、API 调用、资源获取等一次性交互 | 实时聊天、在线游戏、股票行情推送、通知系统等需要实时性的场景 |
| **安全性** | 可以使用 HTTPS 加密 | 可以使用 WSS（WebSocket Secure）加密 |
| **数据格式** | 通常是文本（HTML、JSON、XML） | 支持文本和二进制帧（frame） |
| **协议切换** | 不支持 | 握手阶段通过 HTTP 升级到 WebSocket 协议 |




✅**性能维度对比**

| **性能特性** | **HTTP/1.1** | **WebSocket** |
| --- | --- | --- |
| **通信方式** | 请求-响应（半双工） | 全双工（双向实时通信） |
| **是否需要等待响应** | ✅ 必须等待上一个请求的响应后才能发下一个（除非使用管道化 Pipeline，但支持有限） | ❌ 不需要等待，客户端和服务器可随时发送消息 |
| **连接建立开销** | 每次新请求都要复用或重新建立 TCP 连接（即使有 Keep-Alive 也有延迟） | 一次握手建立连接后长期保持，后续无连接开销 |
| **头部开销** | 每个请求都携带完整 header（可能几百字节） | 握手阶段有 header，之后只传输帧数据（头部极小） |
| **适用高频率交互场景** | ❌ 不适合，频繁请求会带来高延迟和带宽浪费 | ✅ 非常适合，如聊天、游戏、实时行情等 |
| **延迟表现** | 较高延迟（每次请求都要往返） | 极低延迟（无需等待，直接推送） |
| **资源占用** | 多次请求会消耗更多 CPU 和内存（尤其是短连接） | 更高效，一个长连接即可完成所有通信 |




<font style="color:rgb(44, 44, 54);">💡</font>**HTTP/1.1的Pipelining 能否解决这个问题？**

是的，HTTP/1.1 支持一种叫 **Pipeline（管道化）** 的机制，允许客户端在不等待前一个响应的情况下发送多个请求。但是：

| **限制** | **说明** |
| --- | --- |
| 并非所有服务器都支持 | 很多代理、防火墙不兼容 pipelining |
| 仍需按顺序响应 | 服务器必须按请求顺序返回响应（FIFO），不能真正并行 |
| 容易“队首阻塞”（Head-of-line blocking） | 如果第一个请求处理慢，后面的请求即使准备好了也不能先返回 |


### 2.11 WebSocket与Socket的关系 📝
Socket是应用层与TCP/IP协议族通信的中间软件抽象层，它是一组接口。在设计模式中，Socket其实就是一个门面模式，它把复杂的TCP/IP协议族隐藏在Socket接口后面，对用户来说，一组简单的接口就是全部，让Socket去组织数据，以符合指定的协议。  
  
主机 A 的应用程序要能和主机 B 的应用程序通信，必须通过 Socket 建立连接，而建立 Socket 连接必须需要底层 TCP/IP 协议来建立 TCP 连接。建立 TCP 连接需要底层 IP 协议来寻址网络中的主机。我们知道网络层使用的 IP 协议可以帮助我们根据 IP 地址来找到目标主机，但是一台主机上可能运行着多个应用程序，如何才能与指定的应用程序通信就要通过 TCP 或 UPD 的地址也就是端口号来指定。这样就可以通过一个 Socket 实例唯一代表一个主机上的一个应用程序的通信链路了。

## 3. 参考资料
[http://www.52im.net/thread-331-1-1.html](http://www.52im.net/thread-331-1-1.html)

[http://www.52im.net/thread-326-1-1.html](http://www.52im.net/thread-326-1-1.html)

[http://www.52im.net/thread-332-1-1.html](http://www.52im.net/thread-332-1-1.html)

[http://www.52im.net/thread-1258-1-1.html](http://www.52im.net/thread-1258-1-1.html)

[http://www.52im.net/thread-1266-1-1.html](http://www.52im.net/thread-1266-1-1.html)

[http://www.52im.net/thread-1273-1-1.html](http://www.52im.net/thread-1273-1-1.html)

