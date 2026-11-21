# Tarantula Pro (Decky plugin)

Quick-access panel for the original GameSir Tarantula Pro (2.4 GHz dongle
3537:103e, XInput mode) in Steam Game Mode: battery level with low-battery
toasts (20 % / 10 %), firmware, light effect and brightness, gyro-as-mouse
on/off (the controller's own gyro mapping) and the virtual PS4 controller
toggle of the `t3pro-bridge` service.

The protocol module is vendored from the Deadband fork
(`vendors/gamesir/models/t3pro/protocol.py`,
https://github.com/DarkTiengo/gamesir-linux-tools/tree/t3pro-support). The
Tarantula needs that fork's udev rule (`70-gamesir.rules`) for hidraw access, and
the optional `t3pro-bridge` service for the virtual-PS4 toggle.

The battery pill in the top bar is a DOM insertion next to the clock (Decky
has no API for the header); a Steam UI update may hide it until adjusted.

Build: `npm install && npm run build`, then copy `out/tarantula-pro` (see
`package.sh`) into `~/homebrew/plugins/` and restart `plugin_loader`.
