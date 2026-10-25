import test from 'node:test';
import assert from 'node:assert/strict';
import { FocusTimer, formatTime } from './focus-timer.js';

test('counts elapsed clock time, including delayed background updates, and completes once', () => {
  const timer = new FocusTimer();
  timer.start(1000);
  timer.start(2000);
  assert.equal(timer.tick(61_000), false);
  assert.equal(timer.remaining, 24 * 60_000);
  assert.equal(timer.tick(2_000_000), true);
  assert.equal(timer.remaining, 0);
  assert.equal(timer.running, false);
  assert.equal(timer.completed, 1);
  assert.equal(timer.tick(3_000_000), false);
  assert.equal(timer.completed, 1);
});

test('pauses without losing remaining time and resumes without counting paused time', () => {
  const timer = new FocusTimer();
  timer.start(1000);
  timer.pause(1500);
  assert.equal(timer.remaining, 1_499_500);
  timer.tick(100_000);
  assert.equal(timer.remaining, 1_499_500);
  timer.start(200_000);
  timer.tick(200_500);
  assert.equal(timer.remaining, 1_499_000);
  timer.reset();
  assert.equal(timer.remaining, 1_500_000);
  assert.equal(timer.running, false);
  assert.equal(timer.completed, 0);
});

test('completion at pause boundary counts correctly, restart is manual, and breaks do not count as focus', () => {
  const timer = new FocusTimer();
  timer.configure(1, 1);
  timer.start(0);
  assert.equal(timer.pause(60_000), true);
  assert.equal(timer.completed, 1);
  assert.equal(timer.mode, 'focus');
  timer.start(70_000);
  assert.equal(timer.remaining, 60_000);
  timer.select('break');
  assert.equal(timer.running, false);
  assert.equal(timer.remaining, 60_000);
  timer.start(80_000);
  assert.equal(timer.tick(140_000), true);
  assert.equal(timer.completed, 1);
});

test('validates custom lengths and mode before changing state', () => {
  const timer = new FocusTimer();
  for (const values of [[0, 5], [121, 5], [25, 0], [25, 61], [1.5, 5], [NaN, 5], [25, Infinity], ['25', 5]]) {
    assert.throws(() => timer.configure(...values));
  }
  assert.throws(() => timer.select('unknown'));
  assert.equal(timer.remaining, 1_500_000);
  timer.configure(120, 60);
  assert.equal(timer.remaining, 7_200_000);
  timer.select('break');
  assert.equal(timer.remaining, 3_600_000);
});

test('formats remaining time without displaying zero before completion', () => {
  assert.equal(formatTime(1_500_000), '25:00');
  assert.equal(formatTime(59_001), '01:00');
  assert.equal(formatTime(1), '00:01');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(7_200_000), '120:00');
});
