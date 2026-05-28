# GL.iNet MT6000 Tailscale 配置备份

OpenWrt 21.02 (GL Beta) 上 `luci-app-tailscale` (asvow 版) 的修改备份。

## 包含内容

```
files/
  luci-app-tailscale.ipk         — asvow 版 v1.2.6 原包（防止源失效）
  luci-i18n-tailscale-zh-cn.ipk  — 中文语言包
  tailscale-init-fix.sh          — init.d 修复脚本（纯 sh 实现，无外部依赖）
  www/luci-static/resources/view/tailscale/
    interface.js                  — 增强版接口页面（社区版节点列表 + 直连/中继状态列）

patches/
  interface.js.orig              — ipk 原版 interface.js 备份（minified）
  setting.js.orig                — ipk 原版 setting.js 备份（minified）
  tailscale_helper.orig          — /usr/sbin/tailscale_helper（原版，来自 ipk）
  init.d_tailscale.orig          — /etc/init.d/tailscale（原版，来自 ipk）
  tailscale_uci_config           — /etc/config/tailscale（配置模板）
```

## 快速部署（从零开始，一次成功）

在路由器上运行：

```bash
wget -O- https://raw.githubusercontent.com/sakura-hua/gl-mt6000-tailscale-config/main/deploy.sh | sh
```

装完后填 authkey 并启动：

```bash
uci set tailscale.@tailscale[0].login_server='https://你的地址:端口'
uci set tailscale.@tailscale[0].authkey='hskey-xxx...'
uci commit tailscale
/etc/init.d/tailscale enable
/etc/init.d/tailscale start
```

或在 LuCI 页面设置 Login Server 后，在页面填入 authkey 再点"保存并应用"。

## 接口页面增强

`interface.js` 在 asvow 原版基础上重写，移植自 [Tokisaki-Galaxy/luci-app-tailscale-community](https://github.com/Tokisaki-Galaxy/luci-app-tailscale-community) 的节点列表样式：

- **状态栏** — 横排显示 Session Status / Version / TUN Mode / IPv4 / IPv6 / Tailnet Name，自动轮询刷新
- **节点表格** — 包含状态圆点（●在线/○离线/●退出节点）、Hostname、Tailscale IP、OS、Connection（直连/中继）、RX/TX 流量、Last Seen 上次在线时间
- **多一列 Connection** — 相比社区版额外添加，显示直连 IP 或中继地址，绿色=直连/橙色=中继
- **数据来源** — 使用 `fs.exec('tailscale status --json')`，不依赖 ucode RPC，兼容 21.02
- **定时轮询** — 每 ~10s 自动刷新状态和节点列表

原版 `setting.js` 不变（设置页面），备份在 `patches/` 目录。

## 已知 Bug 与修复

### Bug 1: authkey 字段名不匹配

LuCI 页面"保存并应用"时，把值写入 UCI 的 `authKey` 字段（驼峰），
但 `/etc/init.d/tailscale` 中 `config_get` 读的是 `authkey`（全小写），
导致 authkey 永远传不进去。

**修复**：`tailscale-init-fix.sh` 已改为读取 `authKey`。

### Bug 2: tailscale_helper 超时杀 daemon

`/usr/sbin/tailscale_helper` 二进制内置 5 秒超时：
- `tailscale up` 在移动宽带上通常需要 10-15 秒
- 超时后 helper 调用 `revert_exit()` 杀掉 tailscaled 进程
- procd 设置 respawn 导致 helper 无限重启 -> crash loop

**修复**：`tailscale-init-fix.sh` 完全绕过 helper 二进制，
在 `start_instance()` 中直接调用 `tailscale up`（无超时限制）。

### Bug 3: helper procd respawn crash loop

原版 init.d 为 helper 实例设置了 `procd_set_param respawn`，
但 helper 是**一次性配置脚本**（执行完正常退出），
procd 将其判定为崩溃并无限重启。

**修复**：`tailscale-init-fix.sh` 已删除 helper 的 procd 管理，
改用后台进程 `( sleep 3 && tailscale $args ) &`。

## 手动部署步骤

若 deploy.sh 不适用，手动操作：

```bash
# 1. 从本仓库下载安装包
wget -O /root/luci-app-tailscale.ipk \
  https://raw.githubusercontent.com/sakura-hua/gl-mt6000-tailscale-config/main/files/luci-app-tailscale.ipk
wget -O /root/luci-i18n-tailscale-zh-cn.ipk \
  https://raw.githubusercontent.com/sakura-hua/gl-mt6000-tailscale-config/main/files/luci-i18n-tailscale-zh-cn.ipk
opkg install --force-overwrite /root/luci-app-tailscale.ipk /root/luci-i18n-tailscale-zh-cn.ipk

# 2. 打 init.d 补丁
wget -O- \
  https://raw.githubusercontent.com/sakura-hua/gl-mt6000-tailscale-config/main/files/tailscale-init-fix.sh | sh

# 3. 覆盖增强版接口页面
wget -O /www/luci-static/resources/view/tailscale/interface.js \
  https://raw.githubusercontent.com/sakura-hua/gl-mt6000-tailscale-config/main/files/www/luci-static/resources/view/tailscale/interface.js

# 4. 配置
uci set tailscale.@tailscale[0].login_server='https://YOUR_HEADSCALE_IP:PORT'
uci set tailscale.@tailscale[0].authkey='YOUR_AUTH_KEY'
uci set tailscale.@tailscale[0].fw_mode='iptables'
uci commit tailscale

# 5. 启动
/etc/init.d/tailscale enable
/etc/init.d/tailscale start
```

## 环境

| 项目 | 值 |
|------|-----|
| 路由器 | GL.iNet MT6000 (GL-MT6000) |
| 固件 | OpenWrt 21.02-SNAPSHOT (GL Beta) |
| Tailscale 包 | asvow 版 luci-app-tailscale v1.2.6 |
|  Headscale | v0.28.0 @ YOUR_HEADSCALE_IP:PORT |

## Credits

- [asvow/luci-app-tailscale](https://github.com/asvow/luci-app-tailscale)（GPL-3.0）— 原始包本体
- [Tokisaki-Galaxy/luci-app-tailscale-community](https://github.com/Tokisaki-Galaxy/luci-app-tailscale-community) — 增强版 interface.js 节点列表与状态栏样式移植自本项目
