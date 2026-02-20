#!/usr/bin/env node
import { finalizeSession } from './lib/finalize-session.mjs';

try {
  finalizeSession();
} catch {
  // Silent failure
}
