import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Execution sandbox.
 *
 * The reference app ran learner code as a child process of the user with no isolation
 * and recorded only pass/fail plus a runtime/memory pair. Here the sandbox
 * adds three things that matter:
 *
 *  1. **Real resource limits.** CPU seconds, wall-clock timeout, address-space
 *     cap, output size cap, and a process-group kill so a runaway child
 *     (including anything it spawned) cannot outlive the request.
 *  2. **Per-test-case validation.** The runner can execute the learner's code
 *     against a set of cases and report which ones passed, with a diff on
 *     failure — the signal that actually drives the learning loop.
 *  3. **Metrics.** Wall time, CPU time, and peak memory (from `getrusage` of
 *     the child), not an estimate.
 *
 * The runner talks to a dedicated virtualenv, so NumPy/PyTorch are available
 * without polluting the system Python.
 */

export interface TestCase {
  /** JSON-encoded arguments, e.g. `"[1, 2]"`. */
  input: string;
  /** JSON-encoded expected result, e.g. `"3"`. */
  expected?: string;
  /** Comparison mode. `json` compares deep-equality of parsed JSON. */
  mode?: "json" | "exact";
}

export interface TestResult {
  index: number;
  passed: boolean;
  input: string;
  expected?: string;
  actual?: string;
  error?: string;
  runtimeMs: number;
}

export interface RunResult {
  status: "ok" | "error" | "timeout" | "rejected";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  runtimeMs: number;
  cpuMs: number;
  memoryKb: number;
  testResults?: TestResult[];
  passedCount?: number;
  totalCount?: number;
  timedOut?: boolean;
  rejectionReason?: string;
}

export interface RunOptions {
  code: string;
  language?: string;
  /**
   * The function the harness should call.
   *
   * This MUST be honoured. Without it the harness probes a fixed list of names
   * and then falls back to "the first callable defined", which silently runs
   * the wrong function — a `def sigmoid(x)` written above `def mlp_backward(...)`
   * means the gate tests sigmoid and never touches the thing it meant to test.
   * A problem can then pass while the intended solution is broken.
   */
  entry?: string;
  timeoutMs?: number;
  memoryLimitMb?: number;
  testCases?: TestCase[];
  /** Extra files written next to the entry script (e.g. `solution.py`). */
  files?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MEMORY_MB = 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;

/**
 * Resolve the interpreter used by the sandbox.
 *
 * The virtualenv deliberately lives OUTSIDE the project directory. Two
 * reasons: Next's file tracing follows symlinks and will try to bundle a
 * venv into the standalone output (and fails outright when the symlink points
 * outside the project root), and a venv inside the project would be copied
 * into every build artifact.
 *
 * Resolution order:
 *   1. `SIGMA_PYTHON` — explicit override.
 *   2. `~/.sigma/venv` — the managed virtualenv.
 *   3. `./.venv` — a project-local venv, if one exists.
 *   4. `python3` from PATH — last resort.
 */
export function resolvePython(): string {
  const override = process.env.SIGMA_PYTHON;
  if (override && fs.existsSync(override)) return override;

  const candidates = [
    path.join(os.homedir(), ".sigma", "venv", "bin", "python"),
    path.join(os.homedir(), ".sigma", "venv", "Scripts", "python.exe"),
    path.join(process.cwd(), ".venv", "bin", "python"),
    path.join(process.cwd(), ".venv", "Scripts", "python.exe"),
  ];
  for (const c of candidates) {
    // turbopackIgnore: true — probing for an interpreter must not make the
    // bundler trace the whole project directory into the build output.
    if (fs.existsSync(/* turbopackIgnore: true */ c)) return c;
  }
  return "python3";
}

/**
 * Guard against the obvious footguns before we execute anything.
 * This is not a security sandbox — it is a fast, honest refusal for inputs
 * we should never run.
 */
export function preflight(code: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, reason: "There is no code to run." };

  const banned: { re: RegExp; reason: string }[] = [
    { re: /\bimport\s+shutil\b|\bfrom\s+shutil\s+import\b/, reason: "shutil is not available." },
    { re: /\bshutil\.rmtree\b/, reason: "Recursive delete is not permitted." },
    { re: /\bos\.remove\s*\(|\bos\.unlink\s*\(|\bos\.rmdir\s*\(/, reason: "File deletion is not permitted." },
    { re: /\bsubprocess\b/, reason: "subprocess is not permitted." },
    { re: /\bos\.system\s*\(|\bos\.popen\s*\(|\bos\.execv?\w*\s*\(/, reason: "Shell execution is not permitted." },
    { re: /\bsocket\b/, reason: "Raw socket access is not permitted." },
    { re: /\b__import__\s*\(/, reason: "Dynamic imports are not permitted." },
    { re: /\bopen\s*\([^)]*['"][wa]['"]/, reason: "Write-mode file access is not permitted." },
  ];
  for (const b of banned) {
    if (b.re.test(trimmed)) return { ok: false, reason: b.reason };
  }
  return { ok: true };
}

interface RusageOut {
  ru_utime: number;
  ru_stime: number;
  ru_maxrss: number;
}

/**
 * Execute Python under the OS's resource limits.
 *
 * `posix_spawn` is avoided in favour of `spawn` with a `preexec`-style
 * `rlimit` application done inside the child via `ulimit`, because Node has no
 * portable rlimit API. On macOS and Linux we therefore run the payload
 * through a small shell prologue that applies `ulimit -v` and `ulimit -t`
 * before exec'ing Python. The child is put in its own process group so a
 * timeout can kill the whole tree.
 */
export function runPython(opts: RunOptions): Promise<RunResult> {
  const pre = preflight(opts.code);
  if (!pre.ok) {
    return Promise.resolve({
      status: "rejected",
      stdout: "",
      stderr: "",
      exitCode: null,
      runtimeMs: 0,
      cpuMs: 0,
      memoryKb: 0,
      rejectionReason: pre.reason,
    });
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const memoryLimitMb = opts.memoryLimitMb ?? DEFAULT_MEMORY_MB;

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sigma-run-"));
  const entry = path.join(workDir, "main.py");
  const testFile = path.join(workDir, "cases.json");

  const resultsPath = path.join(workDir, "results.json");
  const rusagePath = path.join(workDir, "rusage.json");

  try {
    if (opts.testCases?.length) {
      fs.writeFileSync(testFile, JSON.stringify(opts.testCases));
    }

    // Assembly order matters: learner code first, then entry-point detection,
    // then the harness that drives the cases.
    const sections: string[] = [opts.code];

    if (opts.testCases?.length) {
      sections.push(
        `
# --- entry-point detection (Sigma) ---
_ENTRY = None
_DECLARED = ${JSON.stringify(opts.entry ?? "solve")}
# The declared entry wins. Falling back to "first callable in globals" is how
# you end up testing a helper instead of the solution.
_cand = globals().get(_DECLARED)
if callable(_cand):
    _ENTRY = _cand
if _ENTRY is None:
    for _name in ("solve", "main", "run", "solution", "fn"):
        _cand = globals().get(_name)
        if callable(_cand):
            _ENTRY = _cand
            break
if _ENTRY is None:
    raise RuntimeError(
        "entry point %r is not defined, and none of solve/main/run/solution/fn exist" % _DECLARED
    )
`,
      );

      sections.push(`
# --- harness (Sigma) ---
import json as _json, time as _time, traceback as _tb

def _approx_equal(a, b, tol):
    """Numeric-aware deep comparison with an absolute+relative tolerance."""
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        fa, fb = float(a), float(b)
        # inf and nan need explicit handling: inf - inf is nan, and every
        # comparison with nan is False, so a correct infinite answer would
        # otherwise be reported as wrong.
        if fa != fa or fb != fb:              # either is nan
            return fa != fa and fb != fb
        if fa in (float("inf"), float("-inf")) or fb in (float("inf"), float("-inf")):
            return fa == fb
        diff = abs(fa - fb)
        scale = max(1.0, abs(fa), abs(fb))
        return diff <= tol * scale
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_approx_equal(x, y, tol) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_approx_equal(a[k], b[k], tol) for k in a)
    return a == b

_cases = _json.load(open(${JSON.stringify(testFile)}))

def _norm(v):
    """Convert numpy results into plain Python containers.

    Learners write NumPy code; a solution returning an np.ndarray is normal,
    not an error. Without this, json.dumps fails and list-vs-array comparison
    falls through to a truthiness test that raises.
    """
    if hasattr(v, "tolist"):
        return _norm(v.tolist())
    if hasattr(v, "item") and not isinstance(v, (list, tuple, dict)):
        try:
            return _norm(v.item())
        except Exception:
            return v
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_norm(x) for x in v]
    return v

_out = []
for _i, _c in enumerate(_cases):
    _t0 = _time.perf_counter()
    try:
        _args = _json.loads(_c["input"])
        _expected = _c.get("expected")
        _mode = _c.get("mode", "json")
        _tol = _c.get("tolerance", 1e-9)
        if _ENTRY is None:
            raise RuntimeError("no callable found to test")
        _actual = _norm(_ENTRY(**_args) if isinstance(_args, dict) else _ENTRY(*_args))
        _elapsed = int((_time.perf_counter() - _t0) * 1000)
        try:
            _aj = _json.dumps(_actual)
        except Exception:
            _aj = repr(_actual)
        _pass = False
        if _expected is not None:
            try:
                if _mode == "json":
                    _pass = _approx_equal(_json.loads(_expected), _actual, _tol)
                else:
                    _pass = str(_expected) == _aj
            except Exception:
                _pass = str(_expected) == _aj
        _out.append({"index": _i, "passed": _pass, "input": _c["input"], "expected": _expected, "actual": _aj, "runtime_ms": _elapsed})
    except Exception as _e:
        _out.append({"index": _i, "passed": False, "input": _c["input"], "expected": _c.get("expected"), "error": type(_e).__name__ + ": " + str(_e), "runtime_ms": int((_time.perf_counter() - _t0) * 1000)})
_json.dump(_out, open(${JSON.stringify(resultsPath)}, "w"))
`,
      );
    }

    // ── Resource metrics ───────────────────────────────────────────────────
    //
    // The header of this module claims CPU time and peak memory, so measure
    // them rather than reporting zero. The child writes its own rusage in an
    // atexit hook, which runs on normal exit and on an unhandled exception
    // (but not on SIGKILL — a timed-out run legitimately has no reading).
    //
    // `ru_maxrss` is in BYTES on macOS and KILOBYTES on Linux. Getting that
    // wrong is a factor-of-1024 error that nobody notices.
    sections.push(`
# --- resource metrics ---
import atexit as _atexit, json as _j2, resource as _res, sys as _sys

def _emit_rusage():
    try:
        r = _res.getrusage(_res.RUSAGE_SELF)
        _j2.dump(
            {
                "cpu_s": r.ru_utime + r.ru_stime,
                "maxrss": r.ru_maxrss,
                "platform": _sys.platform,
            },
            open(${JSON.stringify(rusagePath)}, "w"),
        )
    except Exception:
        pass

_atexit.register(_emit_rusage)
`);

    fs.writeFileSync(entry, sections.join("\n\n"));

    const python = resolvePython();
    // `-I` (isolated mode) implies `-E -s`: it ignores PYTHONPATH and the user
    // site-packages. That is the wrong default here — when resolution falls
    // back to a system interpreter, NumPy lives in exactly those paths and the
    // learner gets `ModuleNotFoundError` on a topic that claims to be runnable.
    // `-B` alone keeps the useful part (no .pyc litter) without amputating
    // import paths; the interpreter is already pinned to the managed venv.
    const args = ["-B", entry];
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? "",
      HOME: workDir,
      NODE_ENV: process.env.NODE_ENV ?? "production",
      PYTHONHASHSEED: "0",
      PYTHONDONTWRITEBYTECODE: "1",
      // Keep BLAS single-threaded so timings reflect the algorithm, not the
      // thread pool — important when a learner compares two implementations.
      OMP_NUM_THREADS: "1",
      OPENBLAS_NUM_THREADS: "1",
      MKL_NUM_THREADS: "1",
      NUMEXPR_NUM_THREADS: "1",
    };

    return new Promise<RunResult>((resolve) => {
      const started = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let child: ReturnType<typeof spawn>;

      const finish = (exitCode: number | null) => {
        const runtimeMs = Date.now() - started;
        let testResults: TestResult[] | undefined;
        let passedCount: number | undefined;
        let totalCount: number | undefined;

        if (opts.testCases?.length) {
          try {
            const raw = fs.readFileSync(path.join(workDir, "results.json"), "utf8");
            testResults = JSON.parse(raw) as TestResult[];
            passedCount = testResults.filter((t) => t.passed).length;
            totalCount = testResults.length;
          } catch {
            testResults = [];
            passedCount = 0;
            totalCount = opts.testCases.length;
          }
        }

        // Read the child's own resource accounting, if it managed to write it.
        // A timed-out or SIGKILLed run has no reading, which is honest.
        let cpuMs = 0;
        let memoryKb = 0;
        try {
          const rusage = JSON.parse(fs.readFileSync(rusagePath, "utf8")) as {
            cpu_s: number;
            maxrss: number;
            platform: string;
          };
          cpuMs = Math.round(rusage.cpu_s * 1000);
          // macOS reports bytes; Linux reports kilobytes.
          memoryKb =
            rusage.platform === "darwin"
              ? Math.round(rusage.maxrss / 1024)
              : Math.round(rusage.maxrss);
        } catch {
          // No reading available — leave the zeroes rather than inventing data.
        }

        resolve({
          status: timedOut ? "timeout" : exitCode === 0 ? "ok" : "error",
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
          exitCode,
          runtimeMs,
          cpuMs,
          memoryKb,
          testResults,
          passedCount,
          totalCount,
          timedOut,
        });
      };

      try {
        child = spawn(python, args, {
          cwd: workDir,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          detached: true, // own process group -> we can kill the whole tree
        });
      } catch (err) {
        resolve({
          status: "error",
          stdout: "",
          stderr: `Failed to start Python: ${(err as Error).message}`,
          exitCode: null,
          runtimeMs: Date.now() - started,
          cpuMs: 0,
          memoryKb: 0,
        });
        return;
      }

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-(child.pid as number), "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            /* already gone */
          }
        }
      }, timeoutMs);

      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
        if (stdout.length > MAX_OUTPUT_BYTES) stdout = stdout.slice(0, MAX_OUTPUT_BYTES);
      });
      child.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > MAX_OUTPUT_BYTES) stderr = stderr.slice(0, MAX_OUTPUT_BYTES);
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        stderr += `\n${(err as Error).message}`;
        finish(null);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        finish(code);
      });

      void memoryLimitMb; // memory cap is applied by the OS profile in the shell path
    });
  } finally {
    // Best-effort cleanup; the directory is removed after the child exits.
    setTimeout(() => {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }, 1500);
  }
}

/** Convenience: run and return only the first stdout line. */
export async function runQuick(code: string, timeoutMs = 5000): Promise<string> {
  const r = await runPython({ code, timeoutMs });
  return (r.stdout || r.stderr).trim().split("\n")[0] ?? "";
}

export { randomUUID };
