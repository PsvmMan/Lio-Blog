# <font style="color:#ECAA04;">动态代理</font>
代理模式的核心是代理对象控制对目标对象的访问，可以在调用前后加入额外的逻辑，比如日志、事务等。静态代理需要手动为每个目标类编写代理类，而动态代理则可以在运行时自动生成代理类，这样更灵活，减少了重复代码。

## <font style="background-color:rgba(255, 255, 255, 0);">JDK动态代理</font>
JDK动态代理是基于反射机制实现的，它要求目标类必须实现至少一个接口。代理对象会继承这些接口，并重写其中的方法。当调用代理对象的方法时，实际上会调用InvocationHandler的invoke方法，从而可以在这里插入自定义逻辑。

### <font style="background-color:rgba(255, 255, 255, 0);">1. 基本实现</font>
定义接口

```java
public interface UserInf {
    String addUser(String name);
}
```

接口的实现类

```java
public class User implements UserInf{

    private String name;

    private String password;

    public User() {
    }

    public User(String name, String password) {
        this.name = name;
        this.password = password;
    }

    public String addUser(String name) {
        System.out.println("addUser："+name);
        return "插入用户成功！";
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
```

产生代理对象的工厂

```java
public class JDKProxyFactory implements InvocationHandler {

    //需要被代理的对象
    private Object object;

    public JDKProxyFactory(Object object) {
        this.object = object;
    }

    public <T> T getProxy(Class<T> clazz){
        return (T) Proxy.newProxyInstance(
            Thread.currentThread().getContextClassLoader(),//当前线程的上下文ClassLoader
            object.getClass().getInterfaces(), //代理需要实现的接口
            this); // 处理器自身
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        Object result = null;
        System.out.println("JDK代理开始...");
        result=method.invoke(object, args);
        System.out.println("JDK代理结束...");
        return result;
    }

    public static void main(String[] args) {
        JDKProxyFactory jdkProxyFactory = new JDKProxyFactory(new User());
        UserInf proxy = jdkProxyFactory.getProxy(UserInf.class);
        proxy.addUser("gt");
    }
}
```

### <font style="background-color:rgba(255, 255, 255, 0);">2. 实现原理</font>
JDK动态代理，基于接口生成代理类，这个代理类会实现需要被代理的接口。这个代理类存在一个InvocationHandler属性字段，当我们使用代理类调用接口方法的时候，实际上代理类会调用InvocationHandler属性的invoke方法，而方法的入参就是代理类自身、以及接口的Method对象和方法入参。

所以在使用Proxy生成代理类的时候，它需要一个我们自定义的InvocationHandler实现类，我们会重写invoke方法，并将代理逻辑写在invoke方法中。

```java
public class Proxy0 implements UserInf{

    private InvocationHandler h;

    public Proxy0(InvocationHandler h) {
        this.h = h;
    }

    @Override
    public String addUser(String name) {
        try {
            Method method = UserInf.class.getMethod("addUser", String.class);
            return (String)h.invoke(this, method, new Object[]{name});
        } catch (Exception e) {
            throw new UndeclaredThrowableException(e);
        } catch (Throwable e) {
            throw new RuntimeException(e);
        }
    }

    public static void main(String[] args) {
        JDKProxyFactory jdkProxyFactory = new JDKProxyFactory(new User());
        UserInf proxy0 = new Proxy0(jdkProxyFactory);
        proxy0.addUser("gt");
    }
}
```

### <font style="background-color:rgba(255, 255, 255, 0);">3. 总结</font>
JDK 动态代理通过反射和接口机制，在运行时生成代理对象，只能代理接口，无法代理没有实现接口的类（需用 CGLIB 等库），方法调用开销比较大，因为每次调用涉及到反射，对性能的影响较高。

## <font style="background-color:rgba(255, 255, 255, 0);">CGLIB动态代理</font>
CGLIB（Code Generation Library）动态代理是一个强大的高性能代码生成库，它允许在运行时动态地创建目标类的子类，从而实现对目标类方法的增强或拦截。CGLIB底层使用ASM字节码生成框架，直接操作字节码生成代理类，CGLIB还采用FastClass机制，进一步提高了方法调用的效率。

### <font style="background-color:rgba(255, 255, 255, 0);">1. 基本实现</font>
定义一个User类

```java
public class User {

    public void add(String name){
        System.out.println("add user:"+name);
    }

}
```

CGLIB代理工厂

```java
public class CglibProxyFactory implements MethodInterceptor {

    private Object target;

    public CglibProxyFactory(Object target) {
        this.target = target;
    }

    public CglibProxyFactory() {}

    public <T> T getProxy(Class<T> clazz) {
        Enhancer en = new Enhancer();
        //设置代理的父类
        en.setSuperclass(clazz);
        //设置方法回调，如果这里不想走回调逻辑，可以设置NoOp.INSTANCE
        en.setCallback(this);
        //创建代理实例
        return (T)en.create();
    }

    @Override
    //参数中的object是代理对象，method和args是目标对象的方法和参数，methodProxy是方法代理
    public Object intercept(Object object, Method method, Object[] args, MethodProxy methodProxy) throws Throwable {
        Object result = null;
        System.out.println("JDK代理开始...");
        //调用原来对象的方法，可以理解就是调用object父类的方法
        result = methodProxy.invokeSuper(object, args);

        //这是调用target对象的方法，底层就是会对target强制转化为被代理类的类型
        //然后调用对应的方法，不是反射调用，而是直接调用
        //target对象你可以随便赋值一个对象，在方法调用的时候会报错转换错误
        // result = methodProxy.invoke(target, args);

        System.out.println("JDK代理结束...");
        return result;
    }

    public static void main(String[] args) {
        CglibProxyFactory factory = new CglibProxyFactory();
        User user = factory.getProxy(User.class);
        user.add("gt");
    }
}
```

测试结果：

![](/DynamicAgent/1.png)

### <font style="background-color:rgba(255, 255, 255, 0);">2. 实现原理</font>
intercept方法中送的对象是代理对象，但是我们通常是要调用父类对象的方法（因为我们通常是在被代理对象方法执行的上下添加一些额外的功能逻辑），需要借助MethodProxy方法代理类来实现，它的invokeSuper方法可以帮助我们调用父类（被代理类）的方法。

在介绍原理之前，我先总结用法，因为原理比较复杂，比较绕，如果我们只是使用层面，记住下面两点即可。

1. methodProxy.invokeSuper(object, args)，这个代表调用object对象的父类的方法；
2. methodProxy.invoke(object, args)，这个代表调用object对象本身的方法。

我们想要了解CGLIB的代理原理，肯定要知道它产生的代理类的内容到底长什么样，我们可以在`Enhancer en = new Enhancer();`代码之前加入下面的代码：

```java
System.setProperty(DebuggingClassWriter.DEBUG_LOCATION_PROPERTY, "./cglib");
```

加入了上面的代码，会在我们的根目录下产生`CGLIB`生成的代理类、代理类的索引类、被代理类的索引类，如下面所示：

![](/DynamicAgent/2.png)

一切准备就绪之后，下面就开始讲解`CGLIB`的代理原理了：

首先会生成一个代理类，类名大约叫`User$$EnhancerByCGLIB$$xxxxxxx`，`xxxxxx`真实情况下是随机的，所以我这里用`xxxxx`来表示。这个代理类的源码大致如下，注意下面的源码为了方便理解会有省略，实际上的代理类会更加复杂。当代理类执行`add("gt")`方法的时候，会进入下面的add逻辑，下面的`var10000`是我们自定义的拦截器`CglibProxyFactory`，所以代理类这里最终执行的是拦截器的`intercept`方法。

```java
public class User$$EnhancerByCGLIB$$eaa3a969 extends User implements Factory {

    // 这就是我们创建代理类时候送的拦截器入参对象
    private MethodInterceptor CGLIB$CALLBACK_0;

    // 为add方法创建的MethodProxy对象
    static void CGLIB$STATICHOOK1() {
        CGLIB$add$0$Proxy = MethodProxy.create(var1, var0, "(Ljava/lang/String;)V", "add", "CGLIB$add$0");
    }

    public static MethodProxy create(Class c1, Class c2, String desc, String name1, String name2) {
        MethodProxy proxy = new MethodProxy();
        proxy.sig1 = new Signature(name1, desc);
        proxy.sig2 = new Signature(name2, desc);
        proxy.createInfo = new CreateInfo(c1, c2);
        return proxy;
    }

    // 代理类重写了User类的add方法
    public final void add(String var1) {
        MethodInterceptor var10000 = this.CGLIB$CALLBACK_0;
        if (var10000 == null) {
            CGLIB$BIND_CALLBACKS(this);
            var10000 = this.CGLIB$CALLBACK_0;
        }

        if (var10000 != null) {
            var10000.intercept(this, CGLIB$add$0$Method, new Object[]{var1}, CGLIB$add$0$Proxy);
        } else {
            super.add(var1);
        }
    }
}
```

那我们来到拦截器的`intercept`方法代码逻辑，发现重点执行`methodProxy.invokeSuper(object, args)`

```java
    public Object intercept(Object object, Method method, Object[] args, MethodProxy methodProxy) throws Throwable {
        Object result = null;
        System.out.println("JDK代理开始...");
        result = methodProxy.invokeSuper(object, args);
        System.out.println("JDK代理结束...");
        return result;
    }
```

进入`invokeSuper`方法逻辑

```java
    public Object invokeSuper(Object obj, Object[] args) throws Throwable {
        try {
            this.init();
            FastClassInfo fci = this.fastClassInfo;
            return fci.f2.invoke(fci.i2, obj, args);
        } catch (InvocationTargetException var4) {
            throw var4.getTargetException();
        }
    }
```

首先执行的是`init()`方法，在该方法内部对fastClassInfo字段进行赋值：

```java
    private void init() {
        if (this.fastClassInfo == null) {
            synchronized(this.initLock) {
                if (this.fastClassInfo == null) {
                    CreateInfo ci = this.createInfo;
                    FastClassInfo fci = new FastClassInfo();
                    //fci.f1是被代理类User的索引类User$$FastClassByCGLIB$$xxxxxx的实例对象
                    fci.f1 = helper(ci, ci.c1);
                    //fci.f2是代理类User$$EnhancerByCGLIB$$eaa3a969的索引类User$$EnhancerByCGLIB$$eaa3a969$$FastClassByCGLIB$$xxxxxxx的实例对象
                    fci.f2 = helper(ci, ci.c2);
                    fci.i1 = fci.f1.getIndex(this.sig1);
                    fci.i2 = fci.f2.getIndex(this.sig2);
                    this.fastClassInfo = fci;
                    this.createInfo = null;
                }
            }
        }

    }
```

`fci.f1.getIndex(this.sig1)`方法将会进入User$$FastClassByCGLIB$$xxxxxx类的`getIndex`方法，下面我们看下这个方法的代码，从而我们知道`fci.i1`将会赋值为0

```java
    public int getIndex(Signature var1) {
        String var10000 = var1.toString();
        switch (var10000.hashCode()) {
            case -1358456834:
                if (var10000.equals("add(Ljava/lang/String;)V")) {
                    return 0;
                }
                break;
            case 1826985398:
                if (var10000.equals("equals(Ljava/lang/Object;)Z")) {
                    return 1;
                }
                break;
            case 1913648695:
                if (var10000.equals("toString()Ljava/lang/String;")) {
                    return 2;
                }
                break;
            case 1984935277:
                if (var10000.equals("hashCode()I")) {
                    return 3;
                }
        }

        return -1;
    }
```

`fci.f2.getIndex(this.sig2)`方法将会进入User$$EnhancerByCGLIB$$eaa3a969$$FastClassByCGLIB$$xxxxxxx类的`getIndex`方法，下面我们看下这个方法的代码，从而我们知道`fci.i2`将会赋值为18

```java
    public int getIndex(Signature var1) {
        String var10000 = var1.toString();
        switch (var10000.hashCode()) {
            case -1882565338:
                if (var10000.equals("CGLIB$equals$1(Ljava/lang/Object;)Z")) {
                    return 16;
                }
                break;
            case -1457535688:
                if (var10000.equals("CGLIB$STATICHOOK1()V")) {
                    return 15;
                }
                break;
            case -1422377419:
                if (var10000.equals("CGLIB$add$0(Ljava/lang/String;)V")) {
                    return 18;
                }
                break;
        }
       // 省略一些代码。。。。
        return -1;
    }
```

我们再次回到`invokeSuper`流程，经过`init`方法之后，我们知道了`fci.f2`是代理类的索引类，然后`fci.i2`的值是18，obj是代理对象，args是方法入参，接下来我们去看看`fci.f2`的`invoke`方法

```java
    public Object invokeSuper(Object obj, Object[] args) throws Throwable {
        try {
            this.init();
            FastClassInfo fci = this.fastClassInfo;
            return fci.f2.invoke(fci.i2, obj, args);
        } catch (InvocationTargetException var4) {
            throw var4.getTargetException();
        }
    }
```

User$$EnhancerByCGLIB$$eaa3a969$$FastClassByCGLIB$$xxxxxx类是代理类的索引类，这个类继承了`FastClass`类，接下来我们看下它的`invoke`方法，我们知道`var10001`的值是18，所以会走`var10000.CGLIB$add$0((String)var3[0])`这行代码，而var10000就是代理对象，所以我们知道最终会调用代理类的`CGLIB$add$0`方法。

```java
    public Object invoke(int var1, Object var2, Object[] var3) throws InvocationTargetException {
        User..EnhancerByCGLIB..eaa3a969 var10000 = (User..EnhancerByCGLIB..eaa3a969)var2;
        int var10001 = var1;

        try {
            switch (var10001) {
                case 0:
                    var10000.add((String)var3[0]);
                    return null;
                case 1:
                    return new Boolean(var10000.equals(var3[0]));
                    // 省略一些代码
                case 17:
                    return var10000.CGLIB$clone$4();
                case 18:
                    var10000.CGLIB$add$0((String)var3[0]);
                    return null;
                case 19:
                    return var10000.CGLIB$toString$2();
                case 20:
                    return new Integer(var10000.CGLIB$hashCode$3());
            }
        } catch (Throwable var4) {
            throw new InvocationTargetException(var4);
        }

        throw new IllegalArgumentException("Cannot find matching method/constructor");
    }
```

代理类User$$EnhancerByCGLIB$$xxxxx会继承被代理类`User`，我们可以看到`CGLIB$add$0`的逻辑非常简单，就是去调用父类的`add`方法，那么不就是调用`User`类的`add`方法。

所以`result = methodProxy.invokeSuper(object, args)`兜兜转转就是去调用了`object`对象父类的对应方法，我们可以看到虽然过程有点复杂，但是没有使用到反射的技术。

```java
public class User$$EnhancerByCGLIB$$eaa3a969 extends User implements Factory {
    final void CGLIB$add$0(String var1) {
        super.add(var1);
    }
}
```

### <font style="background-color:rgba(255, 255, 255, 0);">3. 总结</font>
CGLIB动态代理，可以代理任何类，没有实现接口的类也行，通过字节码生成代理对象，创建开销较大，但是方法调用开销很小，因为它是通过继承代理类创建一个子类，子类重写了被代理类中所有非final的方法，方法调用就是正常的调用子类方法，对性能的影响比较低。



