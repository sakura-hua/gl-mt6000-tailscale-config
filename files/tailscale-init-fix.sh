#!/bin/sh
# tailscale-init-fix.sh
# luci-app-tailscale (asvow 版) init.d 修复脚本
# 适用: GL.iNet MT6000 + GL Beta 固件 (OpenWrt 21.02)
# 无外部依赖，仅用 sed + ash 内建
#
# 修复:
#   1. authkey 字段名 — LuCI 保存 'authKey'，init.d 读 'authkey'
#   2. tailscale_helper 二进制硬编码 5s 超时 — 移动宽带延迟高必然失败
#
# 用法:
#   wget -O- https://raw.githubusercontent.com/sakura-hua/luci-app-tailscale-fixes/main/files/tailscale-init-fix.sh | sh
#

set -e

FILE=/etc/init.d/tailscale
[ -f "$FILE" ] || { echo "文件 $FILE 不存在"; exit 1; }

echo "=== 修复 /etc/init.d/tailscale ==="

# 备份
cp "$FILE" "${FILE}.bak.$(date +%Y%m%d%H%M%S)"
echo "  备份: ${FILE}.bak.*"

# 1. 修复 authkey 字段名: authkey -> authKey
sed -i "s/config_get authkey \$cfg 'authkey'/config_get authkey \$cfg 'authKey'/" "$FILE"
echo "  ✓ authkey 字段名: 'authkey' → 'authKey'"

# 2. 替换整个 tailscale_helper() 函数 — 绕过 helper 二进制的 5s 超时
#    找到函数开始的行号
START=$(grep -n '^tailscale_helper()' "$FILE" | cut -d: -f1)
#    找到函数结束的行号（下一个 ^} 前导无缩进）
#    从 START 开始找，第一个顶格 } 就是函数结束
END=$(sed -n "$START,\$p" "$FILE" | grep -n '^}' | head -1 | cut -d: -f1)
END=$((START + END - 1))

if [ -n "$START" ] && [ -n "$END" ]; then
  # 用换行分隔的 sed 替换整段
  cat > /tmp/ts_helper_replacement.txt << 'REPL'
tailscale_helper() {
        local cfg="$1"
        local accept_routes hostname accept_dns advertise_exit_node exit_node advertise_routes disable_snat_subnet_routes flags login_server authkey

        config_get_bool accept_routes $cfg 'accept_routes'
        config_get hostname $cfg 'hostname'
        config_get_bool accept_dns $cfg 'accept_dns'
        config_get_bool advertise_exit_node $cfg 'advertise_exit_node'
        config_get exit_node $cfg 'exit_node'
        config_get advertise_routes $cfg 'advertise_routes'
        config_get_bool disable_snat_subnet_routes $cfg 'disable_snat_subnet_routes'
        config_get flags $cfg 'flags'
        config_get login_server $cfg 'login_server'
        config_get authkey $cfg 'authKey'

        local args="up"
        [ "$accept_routes" = "1" ] && args="$args --accept-routes=true"
        [ -n "$hostname" ] && args="$args --hostname=$hostname"
        [ "$accept_dns" = "0" ] && args="$args --accept-dns=false"
        [ "$advertise_exit_node" = "1" ] && args="$args --advertise-exit-node"
        [ -n "$exit_node" ] && args="$args --exit-node=$exit_node --exit-node-allow-lan-access=true"
        [ -n "$advertise_routes" ] && args="$args --advertise-routes=$(echo $advertise_routes | tr ' ' ',')"
        [ "$disable_snat_subnet_routes" = "1" ] && args="$args --snat-subnet-routes=false"
        [ -n "$flags" ] && args="$args $flags"
        [ -n "$login_server" ] && args="$args --login-server=$login_server"
        [ -n "$authkey" ] && args="$args --authkey=$authkey"

        ( sleep 3 && tailscale $args ) &
}
REPL
  sed -i "${START},${END}d" "$FILE"
  sed -i "${START}r /tmp/ts_helper_replacement.txt" "$FILE"
  rm -f /tmp/ts_helper_replacement.txt
  echo "  ✓ tailscale_helper() 已替换（绕过 5s 超时）"
else
  echo "  ! 未找到 tailscale_helper() 函数，跳过"
fi

echo ""
echo "=== 完成 ==="
