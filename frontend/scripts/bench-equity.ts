/**
 * Equity benchmark on the mock 9-handed all-in table.
 *
 *   bun run dev                      # in another terminal (mock server is dev-only)
 *   bun scripts/bench-equity.ts      # BENCH_URL, BENCH_SECONDS, BENCH_RATES to tweak
 *
 * For each CPU throttling rate (1× = this machine, 4× ≈ mid Android,
 * 6× ≈ low-end Android) it joins the table through the menu, auto-calls every
 * all-in and reports equity calc times, main-thread CPU, frames, long tasks
 * (with the scripts that caused them), JS heap and DOM size. App start-up is
 * excluded: only time spent seated at the table is measured.
 */
import { chromium, type Page } from 'playwright';

const URL = process.env.BENCH_URL ?? 'http://localhost:5173/';
const SECONDS = Number(process.env.BENCH_SECONDS ?? 60);
const RATES = (process.env.BENCH_RATES ?? '1,4,6').split(',').map(Number);

interface Bench {
  calc: {
    id: number;
    board: number;
    players: number;
    ms: number;
    exact: boolean;
    cold: boolean;
    wait: number;
    compute: number;
    delivery: number;
    finishedAt: number;
  }[];
  longTasks: { start: number; duration: number }[];
  loaf: { start: number; duration: number; scripts: string[] }[];
  frames: { at: number; ms: number }[];
  heap: number[];
  dom: number[];
  measureFrom: number;
  /** Times the board reached 5 cards on screen (runouts actually shown). */
  riversShown: number;
  lastBoard: number;
}

// Runs in the page before any app code.
const instrument = () => {
  const bench: Bench = {
    calc: [],
    longTasks: [],
    loaf: [],
    frames: [],
    heap: [],
    dom: [],
    measureFrom: Infinity,
    riversShown: 0,
    lastBoard: 0,
  };

  (window as unknown as { __bench: Bench }).__bench = bench;

  const NativeWorker = window.Worker;

  window.Worker = function (url: string | URL, options?: WorkerOptions) {
    const worker = new NativeWorker(url, options);
    const sent = new Map<
      number,
      { t: number; abs: number; board: number; players: number }
    >();
    const post = worker.postMessage.bind(worker);

    worker.postMessage = (message: {
      id: number;
      board: number[];
      hands: number[][];
    }) => {
      sent.set(message.id, {
        t: performance.now(),
        abs: performance.timeOrigin + performance.now(),
        board: message.board.length,
        players: message.hands.length,
      });
      post(message);
    };
    worker.addEventListener('message', event => {
      const data = event.data as {
        id: number;
        exact: boolean;
        timing?: { received: number; start: number; end: number };
      };
      const request = sent.get(data.id);

      if (request) {
        const arrived = performance.timeOrigin + performance.now();
        const timing = data.timing;

        bench.calc.push({
          id: data.id,
          board: request.board,
          players: request.players,
          ms: performance.now() - request.t,
          exact: data.exact,
          cold: data.id === Math.min(...sent.keys()),
          wait: timing ? timing.received - request.abs : NaN,
          compute: timing ? timing.end - timing.start : NaN,
          delivery: timing ? arrived - timing.end : NaN,
          finishedAt: timing ? timing.end - request.abs : NaN,
        });
      }
    });

    return worker;
  } as unknown as typeof Worker;

  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      bench.longTasks.push({
        start: entry.startTime,
        duration: entry.duration,
      });
    }
  }).observe({ type: 'longtask', buffered: true });

  // Long animation frames name the script (file:function) that took the time.
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as unknown as {
        startTime: number;
        duration: number;
        scripts: {
          sourceURL: string;
          sourceFunctionName: string;
          invoker: string;
          duration: number;
        }[];
      }[]) {
        bench.loaf.push({
          start: entry.startTime,
          duration: entry.duration,
          scripts: entry.scripts
            .filter(script => script.duration > 15)
            .map(script => {
              const file =
                script.sourceURL.split('?')[0].split('/').slice(-2).join('/') ||
                script.invoker;

              return `${file}:${script.sourceFunctionName || '(anon)'}|${script.duration}`;
            }),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    // Not supported: long tasks above still count.
  }

  let last = performance.now();
  const frame = (now: number) => {
    bench.frames.push({ at: now, ms: now - last });
    last = now;
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  setInterval(() => {
    const memory = (
      performance as unknown as { memory?: { usedJSHeapSize: number } }
    ).memory;

    if (memory) {
      bench.heap.push(memory.usedJSHeapSize / 1048576);
    }

    bench.dom.push(document.getElementsByTagName('*').length);

    const board = document.querySelectorAll(
      '[class*=communityCards] svg'
    ).length;

    if (
      board === 5 &&
      bench.lastBoard < 5 &&
      performance.now() >= bench.measureFrom
    ) {
      bench.riversShown += 1;
    }

    bench.lastBoard = board;

    // Call every all-in so a runout follows each hand.
    const call = [...document.querySelectorAll('button')].find(
      button =>
        /^(call|check)/i.test(button.textContent?.trim() ?? '') &&
        !button.disabled
    );

    call?.click();
  }, 200);
};

const stats = (values: number[]) => {
  if (!values.length) {
    return '—';
  }

  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;

  return `n=${values.length} min ${sorted[0].toFixed(0)} avg ${avg.toFixed(0)} p95 ${at(0.95).toFixed(0)} max ${sorted.at(-1)!.toFixed(0)} ms`;
};

const runAt = async (rate: number) => {
  // Precise heap numbers instead of Chromium's bucketed ones.
  const browser = await chromium.launch({
    args: ['--enable-precise-memory-info'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page: Page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await page.addInitScript(instrument);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page
    .getByText(/All-in test/)
    .locator('..')
    .getByRole('button')
    .click();
  await page.waitForURL(/\/game\//, { timeout: 30_000 });

  // Skip app start-up (the dev server compiles modules on the fly): measure
  // only once seated and the first hand is under way.
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    (window as unknown as { __bench: Bench }).__bench.measureFrom =
      performance.now();
  });

  const metricsAt = async () =>
    Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map(m => [
        m.name,
        m.value,
      ])
    );

  const before = await metricsAt();
  const started = Date.now();

  await page.waitForTimeout(SECONDS * 1000);

  const after = await metricsAt();
  const wall = (Date.now() - started) / 1000;
  const bench = await page.evaluate(
    () => (window as unknown as { __bench: Bench }).__bench
  );

  const queueDebug = await page.evaluate(
    () =>
      (window as unknown as { __queueDebug?: Record<string, number> })
        .__queueDebug ?? {}
  );

  await browser.close();

  const from = bench.measureFrom;
  const delta = (key: string) => (after[key] ?? 0) - (before[key] ?? 0);
  const frames = bench.frames.filter(f => f.at >= from).map(f => f.ms);
  // Heads-up and 6+ way preflop answer twice (quick sample, then exact):
  // time the final answer, count each request once.
  const byBoard = (board: number) => {
    const last = new Map<number, number>();

    bench.calc
      .filter(c => c.board === board)
      .forEach(c => last.set(c.id, c.ms));

    return [...last.values()];
  };
  const longTasks = bench.longTasks
    .filter(task => task.start >= from)
    .map(task => task.duration);
  const startupTasks = bench.longTasks.length - longTasks.length;

  console.log(`\n=== CPU ${rate}× — ${wall.toFixed(0)} s seated ===`);
  console.log(
    `runouts: ${byBoard(0).length} started, ${bench.riversShown} reached the river on screen`
  );
  console.log(`equity preflop: ${stats(byBoard(0))}`);
  console.log('  preflop breakdown (ms from request):');
  for (const id of new Set(
    bench.calc.filter(c => c.board === 0).map(c => c.id)
  )) {
    const parts = bench.calc.filter(c => c.id === id);
    const f = (n: number) => n.toFixed(0).padStart(4);
    console.log(
      `    #${id} ${parts[0].players}p${parts[0].cold ? ' cold' : '     '}` +
        ` | worker pickup ${f(parts[0].wait)}` +
        parts
          .map(
            c =>
              ` | ${c.exact ? 'exact ' : 'sample'} compute ${f(c.compute)} done@${f(c.finishedAt)} msg ${f(c.delivery)} shown@${f(c.ms)}`
          )
          .join('')
    );
  }
  console.log(`equity flop:    ${stats(byBoard(3))}`);
  console.log(`equity turn:    ${stats(byBoard(4))}`);
  console.log(`equity river:   ${stats(byBoard(5))}`);
  console.log(
    `main thread busy: ${((delta('TaskDuration') / wall) * 100).toFixed(1)}% ` +
      `(script ${((delta('ScriptDuration') / wall) * 100).toFixed(1)}%, ` +
      `layout ${((delta('LayoutDuration') / wall) * 100).toFixed(1)}%, ` +
      `style ${((delta('RecalcStyleDuration') / wall) * 100).toFixed(1)}%)`
  );
  console.log(
    `long tasks (>50 ms) seated: ${longTasks.length}${longTasks.length ? ' → ' + stats(longTasks) : ''}; at start-up (excluded): ${startupTasks}`
  );

  const culprits = new Map<string, { count: number; total: number }>();

  for (const loaf of bench.loaf) {
    if (loaf.start < from || loaf.duration < 50) {
      continue;
    }

    for (const line of loaf.scripts) {
      const [name, ms] = line.split('|');
      const entry = culprits.get(name) ?? { count: 0, total: 0 };

      entry.count += 1;
      entry.total += Number(ms);
      culprits.set(name, entry);
    }
  }

  if (culprits.size) {
    console.log('  slow-frame scripts (seated):');
    [...culprits.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .forEach(([name, { count, total }]) =>
        console.log(`    ${name}: ${count}× ${total.toFixed(0)} ms`)
      );
  }

  console.log(
    `frames: ${(frames.length / wall).toFixed(0)} fps, ${stats(frames)}, >34 ms: ${frames.filter(f => f > 34).length}`
  );
  console.log(`event queue: ${JSON.stringify(queueDebug)}`);
  console.log(
    `JS heap MB: min ${Math.min(...bench.heap).toFixed(1)} max ${Math.max(...bench.heap).toFixed(1)} end ${bench.heap.at(-1)?.toFixed(1)}`
  );
  console.log(
    `DOM nodes: max ${Math.max(...bench.dom)} end ${bench.dom.at(-1)}`
  );
};

for (const rate of RATES) {
  await runAt(rate);
}
