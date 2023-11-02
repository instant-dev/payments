#! /usr/bin/env node 

import fs from 'fs';
import InstantPayments from '../index.js';

const args = process.argv.slice(2);
const plansPathname = `./_instant/payments/plans.json`;
const lineItemsPathname = `./_instant/payments/line_items.json`;
const cachePathname = `./_instant/payments/cache/stripe_plans.json`;

if (!args[0]) {
  throw new Error(`Must provide command as first parameter, available commands are:\n"bootstrap"`);
}

if (args[0] !== 'bootstrap') {
  throw new Error(`Invalid command "${args[0]}", available commands are:\n"bootstrap"`);
}

if (!args[1]) {
  throw new Error(`Must provide environment name as second parameter for "bootstrap"`);
}

const env = args[1];
const envFile = env === 'development' ? `.env` : `.env.${env}`;
if (!fs.existsSync(envFile)) {
  throw new Error(`Missing env file "${envFile}" for environment "${env}"`);
} else if (fs.statSync(envFile).isDirectory()) {
  throw new Error(`Env file "${envFile}" for environment "${env}" is invalid: is a directory`);
}

const lines = fs.readFileSync(envFile).toString().split('\n');
const entries = lines
  .map(v => v.trim())
  .filter(v => !!v)
  .reduce((entries, line) => {
    const values = line.split('=');
    const key = values[0];
    const value = values.slice(1).join('=');
    entries[key] = value;
    return entries;
  }, {});

if (!entries['STRIPE_SECRET_KEY']) {
  throw new Error(`Missing "STRIPE_SECRET_KEY" in "${envFile}" for environment "${env}"`);
} else if (!entries['STRIPE_PUBLISHABLE_KEY']) {
  throw new Error(`Missing "STRIPE_PUBLISHABLE_KEY" in "${envFile}" for environment "${env}"`);
}

console.log();
console.log(`Bootstrapping Stripe plans for environment "${env}" in "${cachePathname}" ...`);
console.log();

const {cache} = await InstantPayments.bootstrap(
  entries['STRIPE_SECRET_KEY'],
  plansPathname,
  lineItemsPathname
);

InstantPayments.writeCache(cachePathname, env, cache);

console.log();
console.log(`Success! Wrote Stripe plans for environment "${env}" to "${cachePathname}"!`);
console.log();