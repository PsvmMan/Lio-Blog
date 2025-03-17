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
      level: [2, 5],
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
      {
        text: 'Java',
        items: [
          { text: '网络编程', link: '/NetworkProgramming/RPC',activeMatch: "/NetworkProgramming" },
          { text: '并发编程', link: '/ConcurrentProgramming/multithreading',activeMatch: "/ConcurrentProgramming" }
        ]
      }
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
              { text: 'HTTP', link: '' }
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
              { text: '如何实现一个高性能的RPC框架', link: '/RPC' }
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
      }
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/PsvmMan/Psvm-RPC' }
    ],

    search: {
      provider: "local",
    }
  }
})
