import test from 'node:test';
import assert from 'node:assert/strict';
import {setupEditor} from '../docs/editor.js';

test('the editor reveals a focused field as the viewport shrinks and lets the user scroll away', t => {
  const viewport = Object.assign(new EventTarget(), {height: 700, offsetTop: 0, scale: 1});
  const frames = new Map();
  let nextFrame = 0;
  const style = {setProperty() {}, removeProperty() {}};
  const field = {matches: () => true, getBoundingClientRect: () => ({top: 330 - body.scrollTop, height: 46})};
  const body = Object.assign(new EventTarget(), {
    clientHeight: 450,
    contains: element => element === field,
    getBoundingClientRect: () => ({top: 30})
  });
  const dialog = Object.assign(new EventTarget(), {
    open: false, style,
    showModal() { this.open = true; }
  });
  const globals = {
    document: {
      activeElement: field,
      body: {style},
      documentElement: {classList: {add() {}, remove() {}}}
    },
    window: {
      scrollY: 500,
      scrollTo: t.mock.fn(),
      visualViewport: viewport,
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); }
    }
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {value, configurable: true});
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }

  const editor = setupEditor(dialog, body);
  editor.open();
  viewport.height = 340;
  body.clientHeight = 200;
  viewport.dispatchEvent(new Event('resize'));
  assert.equal(frames.size, 1);
  const [[id, reveal]] = frames;
  frames.delete(id);
  reveal();
  assert.equal(body.scrollTop, 154);
  assert.equal(window.scrollTo.mock.callCount(), 0);

  body.scrollTop = 20;
  viewport.offsetTop = 25;
  viewport.dispatchEvent(new Event('scroll'));
  assert.equal(frames.size, 0);
  assert.equal(body.scrollTop, 20);

  viewport.height = 320;
  viewport.dispatchEvent(new Event('resize'));
  dialog.open = false;
  dialog.dispatchEvent(new Event('close'));
  assert.equal(frames.size, 0);
  assert.deepEqual(window.scrollTo.mock.calls[0].arguments, [{top: 500, behavior: 'instant'}]);
});
