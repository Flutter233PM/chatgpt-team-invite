# ChatGPT Team Invite

自动化 ChatGPT Team 邀请系统，支持兑换码验证和管理员界面。

## 功能

- 用户提交邮箱地址 + 兑换码
- 兑换码一次性使用，防止滥用
- 管理员界面：创建/删除/查看兑换码
- 基于 Redis 存储，高性能

## 部署到 Zeabur

1. 登录 [Zeabur](https://zeabur.com)
2. 创建新项目，点击 **Add Service** → **Deploy Your Source Code**
3. 选择此 GitHub 仓库
4. 添加 **Redis** 服务（Marketplace → Redis）
5. 配置环境变量（见下方）
6. 部署完成

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `REDIS_URL` | 是 | Redis 连接字符串（添加 Redis 服务后自动注入） |
| `ADMIN_PASSWORD` | 是 | 管理员密码 |
| `CHATGPT_ACCOUNT_ID` | 是 | ChatGPT Team 账户 ID |
| `CHATGPT_TOKEN` | 是 | ChatGPT 认证 Token |

### 获取 ChatGPT 认证信息

登录 ChatGPT Team 管理后台：

```
https://chatgpt.com/admin/members
```

打开浏览器开发者工具 (F12) → Network 面板 → 随便触发一个请求，找到以下两个值：

| 名称 | Header 字段 |
|------|-------------|
| CHATGPT_ACCOUNT_ID | `chatgpt-account-id` |
| CHATGPT_TOKEN | `authorization` 中 `Bearer ` 后面的部分 |

## 页面说明

| 路径 | 说明 |
|------|------|
| `/` | 用户邀请页面（需输入邮箱和兑换码） |
| `/admin` | 管理员界面（需输入管理员密码） |

## API 说明

### 提交邀请

```
POST /api/invite
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "ABCD1234"
}
```

### 管理员 API

所有管理员 API 需要在 Header 中携带认证信息：

```
Authorization: Bearer <ADMIN_PASSWORD>
```

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/codes` | 列出所有兑换码 |
| POST | `/api/admin/codes` | 创建兑换码 |
| DELETE | `/api/admin/codes/:code` | 删除兑换码 |

**创建兑换码请求体：**

```json
{
  "count": 5,
  "length": 10
}
```

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 需要设置环境变量
export REDIS_URL="redis://localhost:6379"
export ADMIN_PASSWORD="your-password"
export CHATGPT_ACCOUNT_ID="your-account-id"
export CHATGPT_TOKEN="your-token"
```

## 注意事项

- Token 有效期有限，失效后需要重新获取
- 兑换码为一次性使用，使用后自动标记
- 管理员密码请设置强密码

## License

MIT
