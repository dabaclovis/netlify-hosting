export class FocusTimer {
  constructor() {
    this.durations = { focus: 25 * 60_000, break: 5 * 60_000 };
    this.mode = 'focus';
    this.remaining = this.durations.focus;
    this.deadline = null;
    this.completed = 0;
  }

  get running() {
    return this.deadline !== null;
  }

  tick(now = Date.now()) {
    if (!this.running) return false;
    this.remaining = Math.max(0, this.deadline - now);
    if (this.remaining > 0) return false;
    this.deadline = null;
    if (this.mode === 'focus') this.completed++;
    return true;
  }

  start(now = Date.now()) {
    if (this.running) return;
    if (this.remaining === 0) this.remaining = this.durations[this.mode];
    this.deadline = now + this.remaining;
  }

  pause(now = Date.now()) {
    const finished = this.tick(now);
    this.deadline = null;
    return finished;
  }

  reset() {
    this.deadline = null;
    this.remaining = this.durations[this.mode];
  }

  select(mode) {
    if (mode !== 'focus' && mode !== 'break') throw new Error('Unknown timer mode.');
    this.mode = mode;
    this.reset();
  }

  configure(focus, rest) {
    if (!Number.isInteger(focus) || focus < 1 || focus > 120 || !Number.isInteger(rest) || rest < 1 || rest > 60) {
      throw new Error('Choose whole minutes: focus 1-120 and break 1-60.');
    }
    this.durations = { focus: focus * 60_000, break: rest * 60_000 };
    this.reset();
  }
}

export function formatTime(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

if (typeof document !== 'undefined' && document.querySelector('#focus-tool')) {
  const timer = new FocusTimer();
  const title = document.title;
  const clock = document.querySelector('#timer-clock');
  const phase = document.querySelector('#timer-phase');
  const progress = document.querySelector('#timer-progress');
  const toggle = document.querySelector('#timer-toggle');
  const reset = document.querySelector('#timer-reset');
  const status = document.querySelector('#timer-status');
  const sessions = document.querySelector('#timer-sessions');
  const settings = document.querySelector('#timer-settings');
  const modes = [...document.querySelectorAll('[data-mode]')];
  let interval = null;

  function render() {
    const label = timer.mode === 'focus' ? 'Focus' : 'Break';
    clock.textContent = formatTime(timer.remaining);
    phase.textContent = `${label} session`;
    progress.max = timer.durations[timer.mode];
    progress.value = progress.max - timer.remaining;
    let action = 'Start';
    if (timer.remaining === 0) action = 'Restart';
    else if (timer.remaining < timer.durations[timer.mode]) action = 'Resume';
    toggle.textContent = timer.running ? 'Pause' : `${action} ${timer.mode}`;
    sessions.textContent = String(timer.completed);
    for (const button of modes) {
      const selected = button.dataset.mode === timer.mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = timer.running;
    }
    for (const control of settings.elements) control.disabled = timer.running;
    document.title = timer.running ? `${clock.textContent} - ${label} | ${title}` : timer.remaining === 0 ? `${label} complete | ${title}` : title;
  }

  function stopUpdates() {
    clearInterval(interval);
    interval = null;
  }

  function announceCompletion() {
    stopUpdates();
    status.textContent = timer.mode === 'focus'
      ? 'Focus session complete. Nice work! Select Break when you are ready for a rest.'
      : 'Break complete. Select Focus when you are ready for another session.';
  }

  function update() {
    if (timer.tick()) announceCompletion();
    render();
  }

  toggle.addEventListener('click', () => {
    if (timer.running) {
      const finished = timer.pause();
      stopUpdates();
      if (finished) announceCompletion();
      else status.textContent = 'Paused. Resume when you are ready.';
    } else {
      timer.start();
      status.textContent = timer.mode === 'focus' ? 'Focus session running. One task at a time.' : 'Break running. Take a moment to recharge.';
      interval = setInterval(update, 250);
    }
    render();
  });
  reset.addEventListener('click', () => {
    stopUpdates();
    timer.reset();
    status.textContent = 'Timer reset. Ready when you are.';
    render();
  });
  modes.forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.mode === timer.mode) return;
    stopUpdates();
    timer.select(button.dataset.mode);
    status.textContent = `${timer.mode === 'focus' ? 'Focus' : 'Break'} selected. Start when you are ready.`;
    render();
  }));
  settings.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!settings.reportValidity()) return;
    timer.configure(settings.elements.namedItem('focus').valueAsNumber, settings.elements.namedItem('break').valueAsNumber);
    stopUpdates();
    status.textContent = 'Session lengths updated and timer reset.';
    render();
  });
  document.addEventListener('visibilitychange', update);
  document.querySelector('#timer-controls').hidden = false;
  render();
}
