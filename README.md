# 每日行业热讯

手机端优先的文化娱乐行业热点应用。当前版本已经支持：

- 本地运行
- 云端部署
- 手机浏览器访问
- 添加到手机主屏幕，作为 PWA 独立应用使用
- 服务端实时采集微博、抖音热榜，并按文化娱乐行业规则筛选排序

## 手机单独使用的正确方式

手机不能稳定地直接运行这个采集服务，因为真实热榜采集需要服务端去请求外部数据源。要让手机脱离电脑单独使用，需要把本项目部署到云端，然后手机访问云端地址。

推荐路径：

1. 把项目上传到 GitHub。
2. 部署到 Render、Railway、Fly.io、腾讯云、阿里云等 Node.js 服务。
3. 获得一个 HTTPS 地址，例如 `https://daily-industry-hot-news.onrender.com`。
4. 用手机浏览器打开这个地址。
5. 添加到手机主屏幕。

添加后，它会像 App 一样从桌面打开；实时采集仍由云端服务完成。

## 本地运行

双击 `start-app.cmd`，或在当前目录运行：

```bash
node server.js
```

启动后打开：

```text
http://localhost:4173
```

## 云端部署

### Render

项目已包含 `render.yaml`，上传到 GitHub 后，在 Render 新建 Web Service 即可。

配置：

```text
Runtime: Node
Build Command: 留空
Start Command: node server.js
Port: 使用平台自动注入的 PORT
```

### Docker

项目已包含 `Dockerfile`：

```bash
docker build -t daily-industry-hot-news .
docker run -p 4173:4173 daily-industry-hot-news
```

## 当前真实数据源

- 微博：已实时采集
- 抖音：已实时采集
- 公众号：已预留 TianAPI 接入，配置 `TIANAPI_KEY` 后启用
- 小红书：已预留 TikHub 接入，配置 `TIKHUB_API_KEY` 后启用

服务端会请求实时数据，按文化娱乐关键词筛选并归类。如果实时源不可用，会切换到本地兜底数据，页面顶部会显示当前数据状态。

## 推荐规则

综合热度分在 `server.js` 中计算：

```text
平台覆盖度 24%
互动量 26%
上升速度 22%
新鲜度 14%
行业匹配度 14%
```

含义：

- 平台覆盖度：同一热点出现的平台越多，分越高
- 互动量：热度值、讨论量等越高，分越高
- 上升速度：当前排名越靠前、相比上次快照上升越快，分越高
- 新鲜度：越新出现或越近更新的热点，分越高
- 行业匹配度：命中文化娱乐、影视剧集、音乐演出、综艺艺人、游戏动漫关键词越多，分越高

## 文件结构

- `index.html`：手机端页面结构
- `styles.css`：视觉样式
- `app.js`：前端筛选、排序切换、实时接口读取、PWA 注册
- `server.js`：实时数据采集、行业识别、主题合并、推荐排序、静态服务
- `manifest.webmanifest`：手机安装配置
- `sw.js`：离线缓存和 PWA 基础能力
- `icons/app-icon.svg`：桌面图标
- `Dockerfile`：容器部署配置
- `render.yaml`：Render 部署配置

## 后续增强

- 接入公众号和小红书的授权数据源
- 增加账号登录和个人关注行业配置
- 引入更强的主题归并，比如相似标题、同义词、实体识别
- 增加历史趋势曲线，基于多次快照计算真实上升速度
