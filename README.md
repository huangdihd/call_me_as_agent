# Call Me As Agent

像用agent一样调用我❤

一个可以让自己变成一个公用AI Agent给别人干活的项目, 想法借鉴自 https://b23.tv/BLyqezX

一个“人工介入”（Human-in-the-loop）的 LLM 服务端。它允许你拦截、监控并手动回复 LLM API 请求。它支持 **OpenAI** 和 **Claude (Anthropic)** 格式，旨在成为 OpenCode 等工具中真实 LLM API 的替代方案。

## 🌟 核心功能

- **协议兼容性**：完全支持 OpenAI `chat.completion` 和 Claude `messages` API 格式。
- **流式传输 (SSE)**：支持 `stream: true`，可实时流式传输文本和工具调用。
- **多模态支持**：支持渲染对话历史中嵌入的图片（Base64 和 URL）。
- **结构化工具调用**：自动解析可用工具，并生成直观、递归的 UI，用于填写复杂的 JSON 数组、对象、布尔值和数字，无需手写代码。
- **Web 管理面板**：基于 Nuxt UI 构建，提供简洁、响应式的界面，支持角色颜色区分和全宽布局。
- **安全性**：
  - **登录认证**：通过密码保护管理面板。
  - **防爆破逻辑**：内置频率限制，支持反向代理（X-Forwarded-For）识别真实 IP。
  - **动态 API Key**：可为 LLM 端点开启独立的 API Key 校验。

## 🚀 快速开始

1. **安装依赖**:
   ```bash
   npm install
   ```

2. **配置认证**:
   在根目录创建 `.env` 文件并设置管理密码：
   ```env
   ADMIN_PASSWORD=你的安全密码
   ```
   *(如果未设置，面板将处于免密模式，仅建议本地测试使用)。*

3. **启动服务器**:
   ```bash
   npm run dev
   ```
   面板地址：[http://localhost:3000](http://localhost:3000)

## 🛠️ 配置使用

### 1. 配置您的 LLM 客户端
将你的 LLM 客户端（如 OpenCode, LangChain, OpenAI SDK）的 Base URL 指向本地服务器。

- **OpenAI 基础地址**: `http://localhost:3000/api/openai/v1`
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

### 2. 手动回复流程
1. 当客户端发送请求时，服务器会“挂起”并等待。
2. 打开面板 [http://localhost:3000](http://localhost:3000)。
3. 在侧边栏选择新到达的请求。
4. 在右侧 **Text Content** 中输入回复。
5. （可选）使用动态工具按钮添加 **Tool Calls**，并在生成的表单中填写参数。
6. 点击 **Send to Client**，客户端将实时收到您的回复。

## ⚙️ 高级设置
点击侧边栏底部的 **Settings (⚙️)** 图标，你可以：
- 开启/关闭 LLM 端点的 API Key 强制校验。
- 修改预期的 API Key。
- 设置会持久化保存在 `.data/settings.json` 中。

## 🏗️ 技术栈
- [Nuxt 3](https://nuxt.com/)
- [Nuxt UI v4](https://ui.nuxt.com/)
- Tailwind CSS
- TypeScript
