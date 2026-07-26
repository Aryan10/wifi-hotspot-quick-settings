import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Network from 'resource:///org/gnome/shell/ui/status/network.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const HOTSPOT_LABEL = 'Turn On Wi-Fi Hotspot';
const WIFI_PANEL_DESKTOP_FILE = 'gnome-wifi-panel.desktop';
const HOTSPOT_COMMAND = ['nmcli', '-s', 'device', 'wifi', 'hotspot'];

let _originalIndicatorInit = null;
let _currentExtension = null;

function _isObject(value) {
    return value !== null && typeof value === 'object';
}

function _walkObjectGraph(root, callback, seen = new Set(), depth = 0, maxDepth = 4) {
    if (!_isObject(root) || seen.has(root) || depth > maxDepth)
        return;

    seen.add(root);
    callback(root);

    for (const key of Object.keys(root)) {
        let value;
        try {
            value = root[key];
        } catch {
            continue;
        }

        if (_isObject(value))
            _walkObjectGraph(value, callback, seen, depth + 1, maxDepth);
    }
}

class HotspotMenuController {
    constructor() {
        this._entries = new Map(); // menu -> {indicator, menu, item, signalId}
    }

    destroy() {
        for (const entry of this._entries.values()) {
            try {
                if (entry.signalId && entry.menu)
                    entry.menu.disconnect(entry.signalId);
            } catch {
                // ignore
            }

            try {
                entry.item?.destroy?.();
            } catch {
                // ignore
            }
        }

        this._entries.clear();
    }

    attachIndicator(indicator) {
        const menu = indicator?._wirelessToggle?.menu;
        if (!menu || this._entries.has(menu))
            return;

        const item = menu.addAction(HOTSPOT_LABEL, () => {
            void this._turnOnHotspot(indicator);
        });

        const signalId = menu.connect('open-state-changed', () => {
            void this._syncEntry(menu, indicator);
        });

        this._entries.set(menu, {indicator, menu, item, signalId});

        this._moveBeforeAllNetworks(menu, item);
        void this._syncEntry(menu, indicator);
    }

    _moveBeforeAllNetworks(menu, item) {
        const allNetworksItem = menu._settingsActions?.[WIFI_PANEL_DESKTOP_FILE];
        if (!allNetworksItem || typeof menu._getMenuItems !== 'function')
            return;

        const items = menu._getMenuItems();
        const position = items.indexOf(allNetworksItem);
        if (position >= 0 && typeof menu.moveMenuItem === 'function')
            menu.moveMenuItem(item, position);
    }

    async _syncEntry(menu, indicator) {
        const entry = this._entries.get(menu);
        if (!entry)
            return;

        const active = await this._isHotspotActive(indicator);
        entry.item.visible = !active;
    }

    async _isHotspotActive(indicator) {
        const primaryItem = indicator?._wirelessToggle?._itemBinding?.source;
        if (typeof primaryItem?.is_hotspot === 'boolean')
            return primaryItem.is_hotspot;

        const activeConnections = await this._runCommand([
            'nmcli', '-t', '-f', 'NAME', 'connection', 'show', '--active',
        ]);

        if (!activeConnections.ok)
            return false;

        const names = activeConnections.stdout
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);

        for (const name of names) {
            const details = await this._runCommand([
                'nmcli', '-t', '-f', '802-11-wireless.mode,ipv4.method',
                'connection', 'show', name,
            ]);

            if (!details.ok)
                continue;

            const [mode = '', ipv4Method = ''] = details.stdout.trim().split(':');
            if (mode === 'ap' && ipv4Method === 'shared')
                return true;
        }

        return false;
    }

    async _turnOnHotspot(indicator) {
        const result = await this._runCommand(HOTSPOT_COMMAND);

        if (!result.ok) {
            console.error('Wi-Fi Hotspot Quick Settings: failed to enable hotspot:', result.stderr);
            return;
        }

        await this._syncIndicator(indicator);
    }

    async _syncIndicator(indicator) {
        for (const entry of this._entries.values()) {
            if (entry.indicator === indicator)
                await this._syncEntry(entry.menu, indicator);
        }
    }

    _runCommand(argv) {
        return new Promise(resolve => {
            let proc;
            try {
                proc = Gio.Subprocess.new(
                    argv,
                    Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE
                );
            } catch (e) {
                resolve({ok: false, stdout: '', stderr: String(e)});
                return;
            }

            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout, stderr] = p.communicate_utf8_finish(res);
                    resolve({
                        ok: p.get_successful(),
                        stdout: stdout ?? '',
                        stderr: stderr ?? '',
                    });
                } catch (e) {
                    resolve({ok: false, stdout: '', stderr: String(e)});
                }
            });
        });
    }
}

export default class WifiHotspotQuickSettingsMenuExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._controller = new HotspotMenuController();
    }

    enable() {
        _currentExtension = this;

        if (!_originalIndicatorInit) {
            _originalIndicatorInit = Network.Indicator.prototype._init;
            Network.Indicator.prototype._init = function (...args) {
                const result = _originalIndicatorInit.call(this, ...args);
                _currentExtension?._controller.attachIndicator(this);
                return result;
            };
        }

        this._attachExistingIndicators();
    }

    disable() {
        this._controller.destroy();

        if (_originalIndicatorInit) {
            Network.Indicator.prototype._init = _originalIndicatorInit;
            _originalIndicatorInit = null;
        }

        _currentExtension = null;
    }

    _attachExistingIndicators() {
        const root = Main.panel?.statusArea;
        if (!root)
            return;

        _walkObjectGraph(root, obj => {
            if (obj instanceof Network.Indicator || obj?._wirelessToggle?.menu)
                this._controller.attachIndicator(obj);
        });
    }
}

