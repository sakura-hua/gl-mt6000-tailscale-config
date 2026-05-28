#!/bin/sh
# GL.iNet MT6000 — 一键部署 luci-app-tailscale + 修复
#
# 用法（在路由器上直接跑）:
#   wget -O- https://raw.githubusercontent.com/sakura-hua/luci-app-tailscale-fixes/main/deploy.sh | sh
#

REPO_BASE="https://raw.githubusercontent.com/sakura-hua/luci-app-tailscale-fixes/main"

echo ""
echo "=== 1/5 下载 luci-app-tailscale ==="
wget -O /root/luci-app-tailscale.ipk \
  "$REPO_BASE/files/luci-app-tailscale.ipk"
echo "  ✓ 完成"

echo ""
echo "=== 2/5 下载中文语言包 ==="
wget -O /root/luci-i18n-tailscale-zh-cn.ipk \
  "$REPO_BASE/files/luci-i18n-tailscale-zh-cn.ipk"
echo "  ✓ 完成"

echo ""
echo "=== 3/5 安装包 (强制覆盖 GL SDK) ==="
opkg install --force-overwrite /root/luci-app-tailscale.ipk /root/luci-i18n-tailscale-zh-cn.ipk

echo ""
echo "=== 4/5 打 init.d 补丁 ==="
wget -O- "$REPO_BASE/files/tailscale-init-fix.sh" | sh
echo "  ✓ 完成"

echo ""
echo "=== 5/5 覆盖增强版接口页面 ==="
wget -O /www/luci-static/resources/view/tailscale/interface.js \
  "$REPO_BASE/files/www/luci-static/resources/view/tailscale/interface.js"
echo "  ✓ 完成"

echo ""
echo "========================================"
echo "  安装 + 补丁完成"
echo ""
echo "  接下来手动操作:"
echo "  1. 填 authkey (从 Headscale 生成)"
echo ""
echo "     uci set tailscale.@tailscale[0].login_server='https://你的地址:端口'"
echo "     uci set tailscale.@tailscale[0].authkey='hskey-xxx...'"
echo "     uci commit tailscale"
echo ""
echo "  2. 启动"
echo ""
echo "     /etc/init.d/tailscale enable"
echo "     /etc/init.d/tailscale start"
echo ""
echo "========================================"
