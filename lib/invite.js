/**
 * ChatGPT Team 邀请核心逻辑
 * 兼容 Cloudflare Workers 和 Node.js 环境
 */

/**
 * 发送 ChatGPT Team 邀请
 * @param {string} email - 被邀请的邮箱地址
 * @param {string} accountId - ChatGPT Account ID
 * @param {string} token - ChatGPT Bearer Token
 * @returns {Promise<{success: boolean, message: string, data?: any}>}
 */
async function sendInvite(email, accountId, token) {
  // 验证参数
  if (!email || !accountId || !token) {
    return {
      success: false,
      message: '缺少必要参数：邮箱、Account ID 或 Token'
    };
  }

  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      success: false,
      message: '邮箱格式不正确'
    };
  }

  // 构建请求
  const url = `https://chatgpt.com/backend-api/accounts/${accountId}/invites`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://chatgpt.com/admin/members',
    'Authorization': `Bearer ${token}`,
    'ChatGPT-Account-ID': accountId,
    'Content-Type': 'application/json',
    'Origin': 'https://chatgpt.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  };

  const payload = {
    email_addresses: [email],
    role: 'standard-user',
    resend_emails: true
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    // 检查是否被 Cloudflare 拦截
    if (response.status === 403 && responseText.includes('Cloudflare')) {
      return {
        success: false,
        message: '请求被 Cloudflare 拦截，请尝试使用 VPS 部署或配置代理'
      };
    }

    // 尝试解析 JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // 如果不是 JSON，返回原始文本
      data = { raw: responseText };
    }

    if (response.ok) {
      return {
        success: true,
        message: `邀请已发送到 ${email}`,
        data: data
      };
    } else {
      return {
        success: false,
        message: `邀请发送失败 (${response.status})`,
        data: data
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `请求失败: ${error.message}`
    };
  }
}

// 导出函数（兼容 CommonJS 和 ES Modules）
if (typeof module !== 'undefined' && module.exports) {
  // Node.js 环境
  module.exports = { sendInvite };
} else if (typeof exports !== 'undefined') {
  // CommonJS 环境
  exports.sendInvite = sendInvite;
}

// 同时支持 ES6 export（用于 Workers）
export { sendInvite };
