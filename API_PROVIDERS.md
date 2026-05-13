# 小红书和公众号 API 接入说明

当前服务端已经预留并接入了两类真实 API：

## 小红书

默认使用 TikHub 小红书热榜接口。

Render 环境变量：

```text
TIKHUB_API_KEY=你的 TikHub Bearer Token
```

可选，如果你购买或使用的 TikHub 接口路径不同，可以覆盖：

```text
TIKHUB_XHS_ENDPOINT=https://api.tikhub.io/api/v1/xiaohongshu/web_v2/fetch_hot_list
```

服务端会用请求头：

```text
Authorization: Bearer <TIKHUB_API_KEY>
```

## 公众号

默认使用 TianAPI 微信热搜/微信热点接口。

Render 环境变量：

```text
TIANAPI_KEY=你的 TianAPI Key
```

可选，如果你的接口地址不同，可以覆盖：

```text
TIANAPI_WECHAT_ENDPOINT=https://apis.tianapi.com/wxhottopic/index
```

服务端会自动拼接：

```text
?key=<TIANAPI_KEY>
```

## 部署步骤

1. 把本地最新的 `server.js` 上传覆盖 GitHub 仓库中的 `server.js`。
2. 在 Render 的服务页面进入：

```text
Environment -> Add Environment Variable
```

3. 添加：

```text
TIKHUB_API_KEY=你的 TikHub Key
TIANAPI_KEY=你的 TianAPI Key
```

4. 保存后，在 Render 点击：

```text
Manual Deploy -> Deploy latest commit
```

5. 打开：

```text
https://daily-industry-hot-news-api.onrender.com/api/hot
```

查看 `sources` 字段。如果接入成功，会看到：

```json
{
  "platform": "小红书",
  "ok": true,
  "count": 10
}
```

或：

```json
{
  "platform": "公众号",
  "ok": true,
  "count": 10
}
```

## 注意

如果未配置 Key，接口不会报错崩溃，只会在 `sources` 中显示：

```text
未配置 TIKHUB_API_KEY
未配置 TIANAPI_KEY
```

前端网站不需要为这次 API 接入重新上传文件。只要 Render 的 `/api/hot` 返回了新平台数据，页面会自动显示小红书和公众号来源。
