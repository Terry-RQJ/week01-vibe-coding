## 五、手机访问补充（环境排查 · 2026-09-29 14:52）

电脑端确认：服务 `0.0.0.0:8000` 监听中，curl `http://172.18.61.176:8000/` 返回 200。
但 Terry 手机仍连不上——**最可能不是代码或防火墙，是网络层**：
- 手机用了 4G/5G 流量（≠ WiFi）
- 手机和电脑连了不同 SSID（如 2.4G vs 5G、访客网 vs 主网、校园网两个 portal）
- 校园网 / 公共 WiFi 默认开 AP 隔离，禁止客户端互访
- 路由器把电脑归到访客 VLAN

### 推荐改用设备模式（零网络配置，30 秒搞定）

我已用 Edge DevTools `Emulation.setDeviceMetricsOverride{width:375, height:812, dsf:2, mobile:true}` 验证过全部三页无横向溢出，导航三链接正确折行、`aria-current` 高亮正确、相对时间胶囊不换行难看。`day14-history-mobile.png` / `day14-bookmarks-mobile.png` 都是 375 宽下的实际渲染截图。

Terry 自己在 Edge 也能开：
1. `F12`（或右键 → 检查）打开 DevTools
2. 顶部工具栏点第二个图标「Toggle device toolbar」或 `Ctrl+Shift+M`
3. 顶栏下拉选 iPhone 13 / iPhone 14 Pro（默认就是 375 宽）
4. 地址栏直接输 `http://localhost:8000/` —— 不需要 LAN IP

### 如果坚持真机，按这个顺序排查

1. **电脑 WiFi SSID 是什么？** （点屏幕右下角 WiFi 图标看名字）
2. **手机 WiFi SSID 是谁？** 两者名字**完全一样**才行（大小写也算）
3. **手机浏览器访问 `http://172.18.61.176:8000/`** —— 注意是电脑的 IP，不是 `localhost`
4. 还不行：在电脑「设置 → 网络和 Internet → WLAN」看**网络配置文件类型**（私人/公共/域），如果是「公共」，把防火墙规则 profile 设成 Any（已设）
5. 还不行：路由器可能开了 AP 隔离或访客模式——这个改不了，换方法 1