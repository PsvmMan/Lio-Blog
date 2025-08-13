import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Psvm",
  description: "一个基于Netty的高性能RPC框架",
  head: [
    [
      "link",
      {
        rel: "icon",
        href: "/logo.png",
      },
    ],
  ],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/logo.png",

    outline: {
      label: "页面导航",
      level: [1, 5],
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: `Copyright © 2024-${new Date().getFullYear()} Psvm`,
    },

    docFooter: {
      prev: "上一页",
      next: "下一页",
    },

    lastUpdated: {
      text: "最后更新于",
      formatOptions: {
        dateStyle: "short",
        timeStyle: "medium",
      },
    },

    langMenuLabel: "多语言",
    returnToTopLabel: "回到顶部",
    sidebarMenuLabel: "菜单",
    darkModeSwitchLabel: "主题",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",

    nav: [
      { text: '首页', link: '/' },
      { text: 'Redis', link: '/Redis/fast',activeMatch: "/Redis" },
      { text: 'RocketMQ', link: '/RocketMQ/单机环境搭建',activeMatch: "/RocketMQ" },
      { text: 'MySQL', link: '/MySQL/mysql1',activeMatch: "/MySQL" },
      { text: 'Java基础', link: '/',activeMatch: "/JavaBase" },
      { text: '网络编程', link: '/NetworkProgramming/DynamicAgent',activeMatch: "/NetworkProgramming" },
      { text: '并发编程', link: '/ConcurrentProgramming/multithreading',activeMatch: "/ConcurrentProgramming" }
      // {
      //   text: 'Java',
      //   items: [
      //     { text: '网络编程', link: '/NetworkProgramming/RPC_Basics',activeMatch: "/NetworkProgramming" },
      //     { text: '并发编程', link: '/ConcurrentProgramming/multithreading',activeMatch: "/ConcurrentProgramming" }
      //   ]
      // }
    ],

    sidebar: {
      "/NetworkProgramming": {
        base: "/NetworkProgramming",
        items:[
          {
            text: '第一部分：网络协议',
            items: [
              { text: 'TCP', link: '' },
              { text: 'UDP', link: '' },
              { text: 'HTTP', link: '' },
              { text: 'WebSocket', link: '/WebSocket' }
            ]
          },
          {
            text: '第二部分：网络编程',
            items: [
              { text: 'Socket', link: '' },
              { text: 'BIO', link: '' },
              { text: 'NIO', link: '' }
            ]
          },
          {
            text: '第三部分：Netty',
            items: [
              { text: '启动引导层', link: '' },
              { text: '事件调度层', link: '' },
              { text: '服务编排层', link: '' }
            ]
          },
          {
            text: '第四部分：RPC',
            items: [
              { text: '补课：动态代理', link: '/DynamicAgent' },
              { text: 'RPC框架的基础介绍', link: '/RPC_Basics' }
            ]
          }
        ]
      },
      "/ConcurrentProgramming": {
        base: "/ConcurrentProgramming",
        items:[
          {
            text: '第一部分：并发编程',
            items: [
              { text: '并发编程', link: '/multithreading' }
            ]
          }
        ]
      },
      "/JavaBase": {
        base: "/JavaBase",
        items:[
          {
            text: '第一部分：基础',
            items: [
              { text: '集合', link: '/list' }
            ]
          }
        ]
      },
      "/MySQL": {
        base: "/MySQL",
        items:[
          { text: 'MySQL(上)', link: '/mysql1' },
          { text: 'MySQL(下)', link: '/mysql2' }
        ]
      },
      "/Redis": {
        base: "/Redis",
        items:[
          { text: 'Redis高性能', link: '/fast' },
          { text: 'Redis数据持久化', link: '/save' },
          { text: '主从复制', link: '/copy' },
          { text: '哨兵机制', link: '/sentinel' },
          { text: '分片集群', link: '/cluster' },
          { text: '缓存策略', link: '/memory' },
          { text: '缓存异常', link: '/err' }
        ]
      },
      "/RocketMQ": {
        base: "/RocketMQ",
        items:[
          { text: '单机环境搭建', link: '/单机环境搭建' },
          { text: '四种集群方案', link: '/四种集群方案' },
          { text: '搭建Dledger高可用集群', link: '/搭建Dledger高可用集群' },
          { text: 'RocketMQ核心概念', link: '/RocketMQ核心概念' },
          { text: '深度解析RocketMQ', link: '/深度解析RocketMQ' },
          { text: 'RocketMQ的API使用', link: '/RocketMQ的API使用' },
          { text: '事务消息', link: '/事务消息' },
          { text: '消息丢失问题', link: '/消息丢失问题' },
          { text: '消息的有序性', link: '/消息的有序性' },
          { text: '快速处理积压的消息', link: '/快速处理积压的消息' },
          { text: '消息拉取问题', link: '/消息拉取问题' }
        ]
      }
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/PsvmMan' }
    ],

    search: {
      provider: "local",
    }
  }
})
