# Tarantula Pro (Decky plugin)

Quick-access panel for the original GameSir Tarantula Pro (2.4 GHz dongle
3537:103e, XInput mode) in Steam Game Mode: battery level with low-battery
toasts (20 % / 10 %), firmware, light effect and brightness, gyro-as-mouse
on/off (the controller's own gyro mapping) and the virtual PS4 controller
toggle of the `t3pro-bridge` service.

The protocol module is vendored from the Deadband fork
(`vendors/gamesir/models/t3pro/protocol.py`, branch `t3pro-support`).

Build: `npm install && npm run build`, then copy `out/tarantula-pro` (see
`package.sh`) into `~/homebrew/plugins/` and restart `plugin_loader`.
