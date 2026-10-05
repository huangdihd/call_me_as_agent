# Call Me As Agent

像用agent一样调用我❤

一个可以让自己变成一个公用AI Agent给别人干活的项目

一个开源, 简单轻量, 适于本地部署的“人工介入”（Human-in-the-loop）的 LLM 服务端。它允许你拦截、监控并手动回复 LLM API 请求。它支持 **OpenAI** 和 **Claude (Anthropic)** 格式，旨在成为 OpenCode 等工具中真实 LLM API 的替代方案。

## 🌟 核心功能

- **协议兼容性**：完全支持 OpenAI `chat.completion`、OpenAI `v1/responses` 和 Claude `messages` API 格式。
- **流式传输 (SSE)**：支持 `stream: true`，可实时流式传输文本和工具调用。
- **逐字模拟流式**：内置打字机模式，模拟真实 AI 响应过程，支持全局速度调节及单次回复开关。
- **防超时保活 (Keep-alive)**：在等待期间定期发送 SSE 注释包，防止代理或浏览器连接超时。
- **邮件通知与回复 (Email)**：
  - **新请求邮件通知**：有新的待处理请求时，通过 SMTP 发送包含完整对话内容的通知邮件。
  - **回复邮件即回复请求**：通过 IMAP 轮询邮箱，直接回复通知邮件即可把回复内容发送给等待中的客户端（自动去除引用内容和签名，只使用你新写的文字）。
  - 支持配置允许回复的发件人白名单，防止他人伪造回复。
- **多模态支持**：支持渲染对话历史中嵌入的图片（Base64 和 URL），兼容 OpenAI `input_image` 结构。
- **结构化工具调用**：自动解析可用工具，生成递归表单 UI，支持复杂 JSON 嵌套、数字、布尔值校验。
- **外观高度自定义**：
  - **多语言支持**：全站中英文一键切换。
  - **个性化品牌**：自定义站点标题、副标题、品牌色（17 种可选）以及站点 Logo 上传。
  - **隐私控制**：动态控制首页公开显示的统计数据和认证提示。
  - **极致交互**：首页快速切换暗色模式，全站支持平滑的主题颜色过渡动画。
- **安全性**：
  - **登录认证**：密码保护管理后台，启用 OTP (2FA) 二次验证。
  - **网络识别**：支持自定义 IP 识别 Header（如 `CF-Connecting-IP`），精准应对反向代理环境下的防爆破逻辑。
  - **端点认证**：可为 LLM API 单独配置 API Key 校验。

## 🚀 快速开始

1. **克隆仓库**:
   ```bash
   git clone https://github.com/huangdihd/call_me_as_agent.git
   cd call_me_as_agent
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **配置认证**:
   在根目录创建 `.env` 文件并设置管理密码：
   ```env
   ADMIN_PASSWORD=你的安全密码
   ```

4. **启动服务器**:
   ```bash
   npm run dev
   ```
   面板地址：[http://localhost:3000](http://localhost:3000)

## 🛠️ 配置使用

### 1. 配置您的 LLM 客户端
将你的 LLM 客户端的 Base URL 指向本地服务器。

- **OpenAI 基础地址**: `http://localhost:3000/api/openai/v1`
- **OpenAI Responses (beta)**: `http://localhost:3000/api/openai/v1/responses` (专为 OpenAI 官方 SDK 的 `responses.create` 设计)
- **Claude 基础地址**: `http://localhost:3000/api/claude`
- **API Key**: 默认无需填写（除非在设置中开启了 API Key 校验）。

*OpenCode 配置示例 (`opencode.json`):*
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "human/human",
  "provider": {
    "human": {
      "options": {
        "apiKey": "not-required",
        "baseURL": "http://localhost:3000/api/openai/v1"
      },
      "models": {
        "human/human": {
          "name": "Human-Brain"
        }
      }
    }
  }
}
```

### 2. 管理流程
1. 当客户端发送请求时，首页的统计数据会实时更新。
2. 管理员点击页脚的 **Admin Dashboard** 并登录。
3. 在管理后台选择请求并手动回复。

### 3. 通过邮件处理请求（可选）
不想一直盯着后台？可以在 **设置 → 邮件通知与回复** 中开启邮件功能：

1. **配置 SMTP**（如 QQ 邮箱：`smtp.qq.com:465`，密码为授权码），填写通知接收邮箱，并可点击 **发送测试邮件** 验证。
2. 开启 **邮件通知新请求** 后，每个新请求都会发一封包含完整对话内容的邮件，主题形如 `[call-me-as-agent #abc123] New request waiting for reply`。
3. 配置 IMAP（如 `imap.qq.com:993`）并开启 **通过邮件回复请求** 后，直接回复通知邮件即可——服务器会定期轮询邮箱，匹配请求 ID，去掉引用/签名后把你写的内容作为助手回复发送给客户端，并回发一封投递成功的确认邮件。
4. 建议在 **允许回复的邮箱地址** 中填写你自己的邮箱，防止邮箱被他人投递伪造回复。

> 注意：邮件回复仅支持文本内容，工具调用 (Tool Calls) 仍需在 Web 后台完成。

## 🏗️ 技术栈
- [Nuxt 4](https://nuxt.com/)
- [Nuxt UI v4](https://ui.nuxt.com/)
- Tailwind CSS
- TypeScript

## 💬 交流与反馈
欢迎加入群组与我们交流：
- **Telegram Group**: [@call_me_as_agent](https://t.me/call_me_as_agent)
- **QQ 群**: 751692826

## 📄 开源协议
基于 [MIT License](LICENSE) 发布。
