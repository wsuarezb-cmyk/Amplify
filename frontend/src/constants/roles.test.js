import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessAppModule,
  canAccessTraceModule,
  defaultAppRoute,
  defaultTraceModule,
} from './roles.js';

test('admin can access every app module and Trace tab', () => {
  for (const module of ['reporteria', 'planner', 'trace', 'calibracion', 'glosario']) {
    assert.equal(canAccessAppModule('ADMIN', module), true);
  }
  for (const module of ['audiences', 'history', 'sends', 'alerts', 'looker']) {
    assert.equal(canAccessTraceModule('ADMIN', module), true);
  }
});

test('operator can access only Trace, with every Trace tab', () => {
  for (const module of ['reporteria', 'planner', 'calibracion', 'glosario']) {
    assert.equal(canAccessAppModule('OPERATOR', module), false);
  }
  assert.equal(canAccessAppModule('OPERATOR', 'trace'), true);
  for (const module of ['audiences', 'history', 'sends', 'alerts', 'looker']) {
    assert.equal(canAccessTraceModule('OPERATOR', module), true);
  }
});

test('viewer can access only send tracking and Looker Studio in Trace', () => {
  for (const module of ['reporteria', 'planner', 'calibracion', 'glosario']) {
    assert.equal(canAccessAppModule('VIEWER', module), false);
  }
  assert.equal(canAccessAppModule('VIEWER', 'trace'), true);
  for (const module of ['audiences', 'history', 'alerts']) {
    assert.equal(canAccessTraceModule('VIEWER', module), false);
  }
  assert.equal(canAccessTraceModule('VIEWER', 'sends'), true);
  assert.equal(canAccessTraceModule('VIEWER', 'looker'), true);
});

test('landing routes and Trace tab depend on role', () => {
  assert.equal(defaultAppRoute('ADMIN'), '/reporteria');
  assert.equal(defaultAppRoute('OPERATOR'), '/trace');
  assert.equal(defaultAppRoute('VIEWER'), '/trace');
  assert.equal(defaultTraceModule('OPERATOR'), 'audiences');
  assert.equal(defaultTraceModule('VIEWER'), 'sends');
});