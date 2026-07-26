# Wi-Fi Hotspot Quick Settings

A GNOME Shell extension that adds a **"Turn On Wi-Fi Hotspot"** action directly to the Wi-Fi Quick Settings menu, just above **"All Networks"**.

<img width="415" height="358" alt="image" src="https://github.com/user-attachments/assets/06885196-7c44-4c22-8189-b545e2ed5509" />

GNOME already provides a convenient way to turn **off** a hotspot once it is active, but turning one **on** requires opening the Settings application. This extension fills that small usability gap by making hotspot activation available directly from Quick Settings.

The extension currently supports **GNOME Shell 50**, which is the only version it has been tested on. Since it relies on patching GNOME Shell internals, compatibility with future (or past) versions cannot be guaranteed without testing. If you've tested the extension on another GNOME Shell version, feel free to open an issue or pull request to report compatibility.

Hotspot activation is performed using NetworkManager's `nmcli` utility and enables the default **"Hotspot"** connection.

## Installation

### Manual installation

Clone or copy this repository into:

```bash
git clone https://github.com/aryan10/wifi-hotspot-quick-settings.git \
  ~/.local/share/gnome-shell/extensions/wifi-hotspot-quick-settings@aryan10.github.io
```

Then enable the extension:

```bash
gnome-extensions enable wifi-hotspot-quick-settings@aryan10.github.io
```

or enable it using the **Extensions** application.

## License

This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE](LICENSE) file for details.
