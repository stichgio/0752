const { existsSync } = require("fs");
const { spawnSync, spawn } = require("child_process");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const backendEntry = path.join(repoRoot, "backend", "main.py");

const candidates = [
  {
    label: "PYTHON env",
    command: process.env.PYTHON,
    args: [],
    enabled: Boolean(process.env.PYTHON),
  },
  {
    label: "workspace venv",
    command: path.join(repoRoot, "venv", "Scripts", "python.exe"),
    args: [],
    enabled: existsSync(path.join(repoRoot, "venv", "Scripts", "python.exe")),
  },
  {
    label: "python on PATH",
    command: "python",
    args: [],
    enabled: true,
  },
  {
    label: "py launcher 3.11",
    command: "py",
    args: ["-3.11"],
    enabled: true,
  },
  {
    label: "py launcher",
    command: "py",
    args: [],
    enabled: true,
  },
];

function canRun(command, args) {
  if (!command) return false;

  const probe = spawnSync(command, [...args, "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });

  return probe.status === 0;
}

const selected = candidates.find(
  (candidate) => candidate.enabled && canRun(candidate.command, candidate.args),
);

if (!selected) {
  console.error(
    [
      "No se encontró un intérprete de Python utilizable para iniciar el backend.",
      "Opciones probadas: PYTHON, venv\\Scripts\\python.exe, python, py -3.11 y py.",
      "Si ya tienes Python instalado, puedes fijarlo temporalmente con:",
      '$env:PYTHON="C:\\ruta\\a\\python.exe"',
    ].join("\n"),
  );
  process.exit(1);
}

const child = spawn(selected.command, [...selected.args, backendEntry], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: false,
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`No se pudo iniciar el backend con ${selected.label}:`, error.message);
  process.exit(1);
});
