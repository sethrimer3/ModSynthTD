/**
 * run-tests.ts — Imports all test modules and runs them.
 */

declare const process: { exitCode?: number };

import './graph.test';
import './score.test';
import './ticks.test';
import './save.test';
import './economy.test';
import './worlds.test';
import './economy-exploits.test';
import './audio-config.test';
import './sim.test';
import { runAll } from './harness';

const failed = runAll();
if (failed > 0) process.exitCode = 1;
