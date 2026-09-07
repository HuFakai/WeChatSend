// 真机调试及发布时改为已备案、配置 request 合法域名的 HTTPS API。
const API_BASE = 'https://aichat.aisenno.com/api/v1';

export function request<T>(path: string, method: 'GET' | 'POST' = 'GET', data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${path}`,
      method,
      data: data as WechatMiniprogram.IAnyObject | undefined,
      header: {
        'content-type': 'application/json',
        authorization: `Bearer ${wx.getStorageSync('wechatsend_token') || ''}`,
      },
      success(response) {
        if (response.statusCode === 401) {
          wx.removeStorageSync('wechatsend_token');
          wx.reLaunch({ url: '/pages/login/index' });
          return reject(new Error('登录已失效'));
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const body = response.data as { message?: string | string[] };
          return reject(new Error(Array.isArray(body?.message) ? body.message.join('，') : body?.message || '请求失败'));
        }
        resolve(response.data as T);
      },
      fail: (error) => reject(new Error(error.errMsg || '网络连接失败')),
    });
  });
}

export const post = <T>(path: string, data?: unknown) => request<T>(path, 'POST', data);
export const patch = <T>(path: string, data: unknown) => request<T>(`${path}/update`, 'POST', data);
