/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2024 asvow
 * Copyright (C) 2024 Tokisaki-Galaxy (community-style UI)
 *
 * Modified by sakura-hua for GL.iNet MT6000 (OpenWrt 21.02):
 * - fs.exec-based data source (no ucode RPC)
 * - Added Connection column (direct/relay)
 * - CurrentTailnet.Name for Tailnet Name field
 */

'use strict';
'require dom';
'require fs';
'require poll';
'require ui';
'require view';

function formatBytes(bytes) {
	var bytes_num = parseInt(bytes, 10);
	if (isNaN(bytes_num) || bytes_num === 0) return '-';
	var k = 1000;
	var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	var i = Math.floor(Math.log(bytes_num) / Math.log(k));
	return parseFloat((bytes_num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatLastSeen(d) {
	if (!d) return _('N/A');
	if (d === '0001-01-01T00:00:00Z') return _('Now');
	var t = new Date(d);
	if (isNaN(t)) return _('Invalid Date');
	var diff = (Date.now() - t) / 1000;
	if (diff < 0) return t.toLocaleString();
	if (diff < 60) return _('Just now');
	var mins = diff / 60, hrs = mins / 60, days = hrs / 24;
	if (mins < 60) return Math.floor(mins) + ' ' + (Math.floor(mins) === 1 ? _('minute') : _('minutes')) + ' ' + _('ago');
	if (hrs < 24) return Math.floor(hrs) + ' ' + (Math.floor(hrs) === 1 ? _('hour') : _('hours')) + ' ' + _('ago');
	if (days < 30) return Math.floor(days) + ' ' + (Math.floor(days) === 1 ? _('day') : _('days')) + ' ' + _('ago');
	return t.toISOString().slice(0, 10);
}

function renderStatus(status) {
	if (!status || !status.hasOwnProperty('status')) {
		return E('em', {}, _('Collecting data ...'));
	}

	if (status.health && status.health !== '') {
		var notifId = 'ts_health';
		var el = document.getElementById(notifId);
		var msg = _('Health Check') + ': ' + status.health;
		if (el) { el.textContent = msg; }
		else { ui.addNotification(null, E('p', { 'id': notifId }, msg), 'info'); }
	}

	if (status.status === 'not_installed') {
		return E('dl', { 'class': 'cbi-value' }, [
			E('dt', {}, _('Service Status')),
			E('dd', {}, E('span', { 'style': 'color:red;' }, E('strong', {}, _('TAILSCALE NOT FOUND'))))
		]);
	}
	if (status.status === 'logout') {
		return E('dl', { 'class': 'cbi-value' }, [
			E('dt', {}, _('Service Status')),
			E('dd', {}, [
				E('span', { 'style': 'color:orange;' }, E('strong', {}, _('LOGGED OUT'))),
				E('br'),
				E('span', {}, _('Please use the login button in the settings below to authenticate.'))
			])
		]);
	}
	if (status.status !== 'running') {
		return E('dl', { 'class': 'cbi-value' }, [
			E('dt', {}, _('Service Status')),
			E('dd', {}, E('span', { 'style': 'color:red;' }, E('strong', {}, _('NOT RUNNING'))))
		]);
	}

	// Running — horizontal 2-row table matching community version
	var items = [
		{ label: _('Service Status'), value: E('span', { 'style': 'color:green;' }, E('strong', {}, _('RUNNING'))) },
		{ label: _('Version'), value: status.version || 'N/A' },
		{ label: _('TUN Mode'), value: status.TUNMode ? _('Enabled') : _('Disabled') },
		{ label: _('Tailscale IPv4'), value: status.ipv4 || 'N/A' },
		{ label: _('Tailscale IPv6'), value: status.ipv6 || 'N/A' },
		{ label: _('Tailnet Name'), value: status.domain_name || 'N/A' }
	];

	return E('table', { 'style': 'width:100%;border-spacing:0 5px' }, [
		E('tr', {}, items.map(function(item) {
			return E('td', { 'style': 'padding-right:20px' }, E('strong', {}, item.label));
		})),
		E('tr', {}, items.map(function(item) {
			return E('td', { 'style': 'padding-right:20px' }, item.value);
		}))
	]);
}

function renderDevices(peers) {
	if (!peers || Object.keys(peers).length === 0) {
		return E('p', {}, _('No peer devices found.'));
	}

	var thStyle = 'padding-right:20px;text-align:left';
	var tdStyle = 'padding-right:20px';

	return E('table', { 'class': 'cbi-table' }, [
		E('tr', { 'class': 'cbi-table-header' }, [
			E('th', { 'class': 'cbi-table-cell', 'style': 'width:80px;' + thStyle }, _('Status')),
			E('th', { 'class': 'cbi-table-cell', 'style': thStyle }, _('Hostname')),
			E('th', { 'class': 'cbi-table-cell', 'style': thStyle }, _('Tailscale IP')),
			E('th', { 'class': 'cbi-table-cell', 'style': thStyle }, _('OS')),
			E('th', { 'class': 'cbi-table-cell', 'style': thStyle }, _('Connection')),
			E('th', { 'class': 'cbi-table-cell', 'style': thStyle }, _('RX')),
			E('th', { 'class': 'cbi-table-cell', 'style': thStyle }, _('TX')),
			E('th', { 'class': 'cbi-table-cell', 'style': thStyle }, _('Last Seen'))
		])
	].concat(Object.keys(peers).map(function(peerid) {
		var peer = peers[peerid];
		var dotColor = peer.exit_node ? 'blue' : (peer.online ? 'green' : 'gray');
		var dotTitle = (peer.exit_node ? _('Exit Node') + ' ' : '') + (peer.online ? _('Online') : _('Offline'));
		var connColor = 'gray';
		if (peer.linkadress.indexOf('direct') >= 0) connColor = 'green';
		else if (peer.linkadress.indexOf('relay') >= 0) connColor = 'orange';

		return E('tr', { 'class': 'cbi-rowstyle-1' }, [
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle },
				E('span', { 'style': 'color:' + dotColor, 'title': dotTitle },
					peer.online ? '\u25CF' : '\u25CB')),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle },
				E('strong', {}, peer.hostname + (peer.exit_node_option ? ' (ExNode)' : ''))),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, peer.ip || 'N/A'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, peer.ostype || 'N/A'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle + ';color:' + connColor }, peer.linkadress || '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, formatBytes(peer.rx)),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, formatBytes(peer.tx)),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, formatLastSeen(peer.lastseen))
		]);
	})));
}

return view.extend({
	load: function() {
		return L.resolveDefault(
			fs.exec('/usr/sbin/tailscale', ['status', '--json']),
			{ code: -1, stdout: '' }
		).then(function(res) {
			var data = { status: { status: 'stopped' }, peers: {} };
			if (res.code === 0 && res.stdout) {
				try {
					var ts = JSON.parse(res.stdout);

					var st = (ts.BackendState || '').toLowerCase();
					var state;
					if (st === 'running') state = 'running';
					else if (st === 'needslogin') state = 'logout';
					else if (!st) state = 'stopped';
					else state = st;

					var ipv4 = '', ipv6 = '';
					var selfIPs = ts.Self ? ts.Self.TailscaleIPs || [] : [];
					selfIPs.forEach(function(ip) {
						if (ip.indexOf(':') >= 0) ipv6 = ip;
						else ipv4 = ip;
					});

					data.status = {
						status: state,
						version: ts.Version || 'N/A',
						TUNMode: ts.TUN || false,
						ipv4: ipv4 || 'N/A',
						ipv6: ipv6 || 'N/A',
						domain_name: ts.CurrentTailnet ? ts.CurrentTailnet.Name : 'N/A',
						health: ts.Health && ts.Health.length > 0 ? ts.Health.join('; ') : ''
					};

					if (ts.Peer) {
						Object.keys(ts.Peer).forEach(function(key) {
							var p = ts.Peer[key];
							var ips = p.TailscaleIPs || [];
							var ip = ips.length > 0 ? ips[0] : '';
							var linkadress = '-';
							if (p.CurAddr) linkadress = 'direct ' + p.CurAddr;
							else if (p.Relay) linkadress = 'relay via ' + p.Relay;
							data.peers[key] = {
								hostname: p.HostName || (p.DNSName || '').replace(/\..*$/, ''),
								ip: ip,
								ostype: p.OS || 'N/A',
								online: p.Online || false,
								exit_node: p.ExitNode || false,
								exit_node_option: p.ExitNodeOption || false,
								linkadress: linkadress,
								rx: p.RxBytes || 0,
								tx: p.TxBytes || 0,
								lastseen: p.LastSeen || ''
							};
						});
					}
				} catch (e) {}
			}
			return data;
		});
	},

	render: function(data) {
		var self = this;

		var view = E([], [
			E('div', { 'class': 'cbi-map' }, [
				E('h2', { 'name': 'content' }, _('Tailscale')),
				E('div', { 'class': 'cbi-map-descr' },
					_('Tailscale is a cross-platform and easy to use virtual LAN.'))
			]),
			E('div', { 'id': 'service_status_display', 'class': 'cbi-value' },
				renderStatus(data.status)
			),
			E('h3', { 'style': 'margin-top:1.5em' },
				_('Peers') + ' (' + Object.keys(data.peers).length + ')'
			),
			E('div', { 'id': 'tailscale_devices_display' },
				renderDevices(data.peers)
			)
		]);

		// Poll every ~10s
		poll.add(function() {
			self.load().then(function(newData) {
				var ss = document.getElementById('service_status_display');
				var dd = document.getElementById('tailscale_devices_display');
				var h3s = document.querySelectorAll('h3');
				for (var i = 0; i < h3s.length; i++) {
					if (h3s[i].textContent.indexOf('Peers') >= 0) {
						dom.content(h3s[i], 'Peers (' + Object.keys(newData.peers).length + ')');
						break;
					}
				}
				if (ss) dom.content(ss, renderStatus(newData.status));
				if (dd) dom.content(dd, renderDevices(newData.peers));
			});
		});

		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
