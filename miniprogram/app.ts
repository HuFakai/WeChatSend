App({
  onLaunch() {
    const token = wx.getStorageSync('wechatsend_token');
    if (!token) wx.reLaunch({ url: '/pages/login/index' });
  },
});
