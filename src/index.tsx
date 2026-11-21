import {
  ButtonItem,
  DropdownItem,
  PanelSection,
  PanelSectionRow,
  SliderField,
  ToggleField,
  staticClasses,
} from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { FaGamepad } from "react-icons/fa";

type Status = {
  present: boolean;
  battery: number;
  charging: boolean;
  firmware: string;
  light_mode: number;
  brightness: number;
  gyro_output: number;
  gyro_activation: number;
  ds4: boolean;
  bridge: boolean;
  error: string;
};

const getStatus = callable<[], Status>("get_status");
const setLight = callable<[mode: number, brightness: number], boolean>("set_light");
const setGyroMouse = callable<[on: boolean], boolean>("set_gyro_mouse");
const setDs4 = callable<[on: boolean], boolean>("set_ds4");

const MODES = ["Desligado", "Sólido", "Respiração", "Fantasma", "Fluxo", "Radar"];
const ACTIVATION = ["desligado", "liga/desliga com botão", "enquanto segura o botão", "sempre ativo"];

function batteryColor(b: number) {
  return b < 0 ? "#888" : b <= 15 ? "#e0533d" : b <= 30 ? "#e0b23a" : "#3ccb7f";
}

function BatteryBar({ s }: { s: Status }) {
  const pct = Math.max(0, s.battery);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
      <div style={{ flex: 1, height: "12px", borderRadius: "6px", background: "#2a2e37", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: batteryColor(s.battery) }} />
      </div>
      <div style={{ minWidth: "64px", textAlign: "right", fontWeight: 600 }}>
        {s.battery >= 0 ? `${s.battery}%` : "—"}
        {s.charging ? " ⚡" : ""}
      </div>
    </div>
  );
}

function Content() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [bright, setBright] = useState(50);

  const refresh = async () => {
    const st = await getStatus();
    setS(st);
    if (st.present) setBright(st.brightness);
  };
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const act = async (fn: () => Promise<boolean>, okMsg: string) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (!ok) toaster.toast({ title: "Tarantula Pro", body: "Falhou — veja o log do Decky" });
    else if (okMsg) toaster.toast({ title: "Tarantula Pro", body: okMsg });
    await refresh();
  };

  if (!s) return <PanelSection><PanelSectionRow>Lendo o controle…</PanelSectionRow></PanelSection>;
  if (!s.present)
    return (
      <PanelSection title="Tarantula Pro">
        <PanelSectionRow>
          <div>Dongle não encontrado. Conecte o dongle 2.4 GHz e coloque o controle no modo XInput.</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={refresh}>Procurar de novo</ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );

  return (
    <>
      <PanelSection title="Bateria">
        <PanelSectionRow>
          <BatteryBar s={s} />
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            Firmware {s.firmware} · ponte {s.bridge ? "ativa" : "parada"}
            {s.error ? ` · ${s.error}` : ""}
          </div>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Luzes">
        <PanelSectionRow>
          <DropdownItem
            label="Efeito"
            disabled={busy}
            rgOptions={MODES.map((m, i) => ({ data: i, label: m }))}
            selectedOption={s.light_mode}
            onChange={(o) => act(() => setLight(o.data, bright), "")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField
            label="Brilho"
            value={bright}
            min={0}
            max={100}
            step={10}
            showValue
            disabled={busy}
            onChange={(v) => setBright(v)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy || bright === s.brightness}
            onClick={() => act(() => setLight(s.light_mode, bright), "Brilho salvo")}>
            Aplicar brilho
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Gyro">
        <PanelSectionRow>
          <ToggleField
            label="Gyro como mouse"
            description={s.gyro_output === 4
              ? `Ativação: ${ACTIVATION[s.gyro_activation] ?? s.gyro_activation} (ajuste no Deadband)`
              : "O controle move o cursor com o gyro"}
            checked={s.gyro_output === 4}
            disabled={busy}
            onChange={(on) => act(() => setGyroMouse(on), on ? "Gyro como mouse ligado" : "Gyro como mouse desligado")}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Controle PS4 virtual (gyro na Steam)"
            description={s.ds4 ? "A Steam vê um PS4 com gyro e os atalhos HOME + botão"
                               : "A Steam vê só o GameSir Xbox Controller"}
            checked={s.ds4}
            disabled={busy}
            onChange={(on) => act(() => setDs4(on), on ? "Controle PS4 virtual ligado" : "Controle PS4 virtual desligado")}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection>
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy} onClick={refresh}>Atualizar</ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}

// Low-battery warnings even with the panel closed.
let lastWarned = 101;
let timer: ReturnType<typeof setInterval> | undefined;
async function batteryWatch() {
  try {
    const s = await getStatus();
    if (!s.present || s.battery < 0 || s.charging) {
      if (s.charging) lastWarned = 101;
      return;
    }
    for (const level of [10, 20]) {
      if (s.battery <= level && lastWarned > level) {
        lastWarned = level;
        toaster.toast({
          title: "Tarantula Pro",
          body: `Bateria em ${s.battery}% — hora de carregar`,
          critical: level === 10,
        });
        break;
      }
    }
    if (s.battery > 25) lastWarned = 101;
  } catch {
    /* plugin backend not ready yet */
  }
}

export default definePlugin(() => {
  batteryWatch();
  timer = setInterval(batteryWatch, 120000);
  return {
    name: "Tarantula Pro",
    titleView: <div className={staticClasses.Title}>Tarantula Pro</div>,
    content: <Content />,
    icon: <FaGamepad />,
    onDismount() {
      if (timer) clearInterval(timer);
    },
  };
});
