import { computed } from 'vue'

const translations = {
  zh: {
    // General
    save: '保存',
    cancel: '取消',
    login: '登录',
    logout: '退出登录',
    settings: '设置',
    home: '主页',
    admin_dashboard: '管理后台',
    auth_required: '需要身份认证',
    auth_desc: '请输入管理员密码以访问面板。',
    invalid_password: '密码错误',
    settings_saved: '设置已保存',
    settings_failed: '保存设置失败',
    settings_load_failed: '加载设置失败',
    response_sent: '回复已成功发送',
    response_failed: '回复发送失败',
    copied: '已复制到剪贴板',

    // Index Page
    pending_requests: '待处理请求',
    api_key_auth: 'API Key 校验',
    admin_auth: '管理权限',
    active_endpoints: '活跃端点',
    how_it_works: '工作原理',
    how_it_works_desc: '本服务器充当网桥。将您的实际 LLM 提供商 URL 替换为左侧的地址。所有请求都将保留在这里，直到管理员手动提供回复。',
    auth_hint: '需要认证',
    enabled: '已开启',
    disabled: '已关闭',
    active: '已激活',
    bypass: '已跳过',

    // Agent Page
    requests_list: '请求列表',
    no_pending: '暂无待处理请求',
    select_request: '选择一个请求',
    select_request_desc: '从侧边栏选择一个挂起的请求以查看详情并提供回复。新请求将自动出现在这里。',
    request_details: '请求详情',
    received_at: '接收于',
    conv_history: '对话历史',
    manual_response: '手动回复',
    text_content: '文本内容',
    text_placeholder: '以助理身份输入您的回复...',
    tool_calls: '工具调用',
    send_to_client: '发送给客户端',
    add_parameter: '添加参数',
    custom_tool: '自定义工具',
    new_param_name: '新参数名称:',

    // Settings Page
    server_settings: '服务器设置',
    branding_appearance: '外观与显示',
    site_title: '站点标题',
    site_title_desc: '公共状态页上显示的名称。',
    site_subtitle: '站点副标题',
    site_subtitle_desc: '主页标题下方的描述文字。',
    pending_requests_label: '待处理请求标签',
    pending_requests_label_desc: '自定义“待处理请求”卡片的文字（留空使用默认值）。',
    primary_color: '主题颜色',
    primary_color_desc: '整个应用程序的主要强调色。',
    language: '界面语言',
    language_desc: '系统全局显示语言。',
    network_display: '网络与显示',
    public_base_url: '公开 Base URL',
    public_base_url_desc: '向用户展示的 API 端点根地址。',
    show_pending_count: '公开显示待处理数',
    show_pending_count_desc: '在首页显示当前等待请求的数量。',
    show_api_key_hints: '公开显示 API Key 提示',
    show_api_key_hints_desc: '在首页显示 API Key 的要求。',
    api_security: 'API 安全',
    enable_api_key_auth: '开启 API Key 校验',
    enable_api_key_auth_desc: '要求客户端必须提供 API Key 才能访问 OpenAI 和 Claude 端点。',
    expected_api_key: '预期 API Key',
    expected_api_key_desc: '客户端必须在 Header 中发送此完全一致的 Key。',
  },
  en: {
    // General
    save: 'Save',
    cancel: 'Cancel',
    login: 'Login',
    logout: 'Logout',
    settings: 'Settings',
    home: 'Home',
    admin_dashboard: 'Admin Dashboard',
    auth_required: 'Authentication Required',
    auth_desc: 'Please enter the admin password to access the panel.',
    invalid_password: 'Invalid password',
    settings_saved: 'Settings saved successfully',
    settings_failed: 'Failed to save settings',
    settings_load_failed: 'Failed to load settings',
    response_sent: 'Response sent successfully',
    response_failed: 'Failed to submit response',
    copied: 'Copied to clipboard',

    // Index Page
    pending_requests: 'Pending Requests',
    api_key_auth: 'API Key Auth',
    admin_auth: 'Admin Auth',
    active_endpoints: 'Active Endpoints',
    how_it_works: 'How it works',
    how_it_works_desc: 'This server acts as a bridge. Replace your actual LLM provider URL with the ones on the left. All requests will be held here until an administrator manually provides the response.',
    auth_hint: 'Auth Required',
    enabled: 'Enabled',
    disabled: 'Disabled',
    active: 'Active',
    bypass: 'Bypass',

    // Agent Page
    requests_list: 'Requests',
    no_pending: 'No pending requests',
    select_request: 'Select a request',
    select_request_desc: 'Choose a pending request from the sidebar to view details and provide a response. New requests will appear here automatically.',
    request_details: 'Request Details',
    received_at: 'Received at',
    conv_history: 'Conversation History',
    manual_response: 'Manual Response',
    text_content: 'Text Content',
    text_placeholder: 'Type your response as the assistant...',
    tool_calls: 'Tool Calls',
    send_to_client: 'Send to Client',
    add_parameter: 'Add Parameter',
    custom_tool: 'Custom Tool',
    new_param_name: 'New parameter name:',

    // Settings Page
    server_settings: 'Server Settings',
    branding_appearance: 'Branding & Appearance',
    site_title: 'Site Title',
    site_title_desc: 'The name displayed on the public status page.',
    site_subtitle: 'Site Subtitle',
    site_subtitle_desc: 'Description text below the main title on the home page.',
    pending_requests_label: 'Pending Requests Label',
    pending_requests_label_desc: 'Custom text for "Pending Requests" card (leave empty for default).',
    primary_color: 'Primary Theme Color',
    primary_color_desc: 'The main accent color for the entire application.',
    language: 'System Language',
    language_desc: 'The global display language for the system.',
    network_display: 'Network & Display',
    public_base_url: 'Public Base URL',
    public_base_url_desc: 'The root URL shown to users for the API endpoints.',
    show_pending_count: 'Public Pending Count',
    show_pending_count_desc: 'Show the number of waiting requests on the home page.',
    show_api_key_hints: 'Public API Key Hints',
    show_api_key_hints_desc: 'Show API Key requirements on the home page.',
    api_security: 'API Security',
    enable_api_key_auth: 'Enable API Key Auth',
    enable_api_key_auth_desc: 'Require clients to provide an API key to access OpenAI and Claude endpoints.',
    expected_api_key: 'Expected API Key',
    expected_api_key_desc: 'Clients must send this exact key in their headers.',
  }
}

export const useI18n = () => {
  const { data: settings } = useFetch<any>('/api/settings')
  
  const t = (key: keyof typeof translations.en) => {
    const lang = settings.value?.language || 'zh'
    const bundle = translations[lang as 'zh' | 'en'] || translations.en
    return (bundle as any)[key] || key
  }
  
  return { t, lang: computed(() => settings.value?.language || 'zh') }
}
