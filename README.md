# Instant Payments

![travis-ci build](https://travis-ci.org/instant-dev/payments.svg?branch=main)
![npm version](https://img.shields.io/npm/v/@instant.dev/payments?label=)

## Use Stripe as a System of Record

We built Instant Payments because Price discovery in SaaS is difficult: pricing and plans
often take multiple iterations. Having to redo your billing system every time you get a
new piece of information about price points wastes time you could be spending on your product.

Instant Payments provides a simple abstraction on top of Stripe that simplifies
everything to just two `.json` files representing **Plans** and **LineItems**,
which provide abstractions over Stripe's own `Products`, `Prices`, `Subscriptions` and
`SubscriptionItems`. Instant Payments then provides an easy-to-use
`subscribe()` and `unsubscribe()` method:

```javascript
import InstantPayments from '@instant.dev/payments';
const payments = new InstantPayments(
  process.env.STRIPE_SECRET_KEY,
  process.env.STRIPE_PUBLISHABLE_KEY,
  `./_instant/payments/cache/stripe_plans.json` // more on this cached file below
);

let subscription = await payments.customers.subscribe({
  email,
  planName: 'business_plan',
  lineItemCounts: {
    collaborator_seats: 100,
    projects: 0,
    environments: 0,
    linked_apps: 0,
    hostnames: 0
  },
  successURL: `/success/`,
  cancelURL: `/fail/`
});
```

This will automatically configure a `Subscription` with relevant `SubscriptionItems` and
create a [Stripe Checkout](https://stripe.com/payments/checkout) session for your customer
which you can then direct them to on the front end.

## No database or webhooks? How does it work?

Instant Payments makes a few core assumptions to make working with Stripe easier;

- Each user is identified by a unique email (tip: use tags, e.g. `user+tag@email.com`)
- You do not need a custom checkout implementation; Stripe Checkout is acceptable
- Only USD is supported at the moment (may expand scope)

If you can work within these limitations, webhooks can be avoided completely by using
Stripe's hosted checkout for both subscriptions and managing payment methods. You do not
need database synchronization as you can load plan details directly from Stripe using the
user's email. This is slower than a database call but typically can be executed in about 500ms.

## Table of Contents

1. [Getting Started](#getting-started)
   1. [Quickstart via `instant` CLI](#quickstart-via-instant-cli)
   1. [Manual Installation](#manual-installation)
1. [Bootstrapping plans](#bootstrapping-plans)
   1. [Plans: `_instant/payments/plans.json`](#plans-_instantpaymentsplansjson)
   1. [Line Items: `_instant/payments/line_items.json`](#line-items-_instantpaymentsline_itemsjson)
      1. [`capacity` Settings](#capacity-settings)
      1. [`usage` Settings](#usage-settings)
      1. [`flag` Settings ](#flag-settings)
   1. [Bootstrapping via `instant` CLI](#bootstrapping-via-instant-cli)
   1. [Bootstrapping via `npx payments bootstrap`](#bootstrapping-via-npx-payments-bootstrap)
1. [API Reference](#api-reference)
   1. [InstantPayments (class)](#instantpayments-class)
      1. [InstantPayments.bootstrap](#instantpaymentsbootstrap)
      1. [InstantPayments.writeCache](#instantpaymentswritecache)
   1. [InstantPayments (instance)](#instantpayments-instance)
      1. [customers](#customers)
         1. [customers.find](#customersfind)
         1. [customers.subscribe](#customerssubscribe)
         1. [customers.unsubscribe](#customersunsubscribe)
      1. [invoices](#invoices)
         1. [invoices.list](#invoiceslist)
         1. [invoices.upcoming](#invoicesupcoming)
      1. [paymentMethods](#paymentmethods)
         1. [paymentMethods.list](#paymentmethodslist)
         1. [paymentMethods.create](#paymentmethodscreate)
         1. [paymentMethods.remove](#paymentmethodsremove)
         1. [paymentMethods.setDefault](#paymentmethodssetdefault)
      1. [plans](#plans)
         1. [plans.list](#planslist)
         1. [plans.current](#planscurrent)
         1. [plans.billingStatus](#plansbillingstatus)
      1. [usageRecords](#usagerecords)
         1. [usageRecords.create](#usagerecordscreate)
1. [Deploying to different environments](#deploying-to-different-environments)
   1. [Deploying via `instant` CLI](#deploying-via-instant-cli)
   1. [Deploying manually](#deploying-manually)
1. [Acknowledgements](#acknowledgements)

## Getting Started

### Quickstart via `instant` CLI

```
TODO: WIP
```

### Manual Installation

To get started with Instant Payments, you'll first install the package locally:

```shell
cd ~/my/project/dir/
npm i @instant.dev/payments --save
npm i dotenv --save
```

Next, you should create a `.env` file in your root directory for usage locally.
Populate it with keys found on
[dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys).
**Make sure you are on the right account.**

File: `.env`

```
NODE_ENV=development
STRIPE_SECRET_KEY=[your-test-mode-secret-key]
STRIPE_PUBLISHABLE_KEY=[your-test-mode-publishable-key]
```

Next, we'll prepare a basic sample setup for our Stripe plans. We'll have two plans:
**Free** and **Basic**. The **Basic** plan will cost $15.00 USD per month. Additionally,
each plan comes with an AI Assistant. The default usage of the AI Assistant is capped
at 5 messages per month, but the **Basic** plan unlocks 5,000 messages per month.
We can do this by specifying settings overrides for specific line items.

To create the plans, we need to create two files,
`_instant/payments/plans.json` and `_instant/payments/line_items.json`.

File: `_instant/payments/plans.json`

```json
[
  {
    "name": "free_plan",
    "display_name": "Free",
    "enabled": true,
    "visible": true,
    "price": null,
    "line_items_settings": {}
  },
  {
    "name": "basic_plan",
    "display_name": "Basic",
    "enabled": true,
    "visible": true,
    "price": {
      "usd": 1500
    },
    "line_items_settings": {
      "ai_assistant": {
        "value": 5000,
        "display_value": "5,000 messages per month"
      }
    }
  }
]
```

File: `_instant/payments/line_items.json`

```json
[
  {
    "name": "ai_assistant",
    "display_name": "AI Assistant",
    "description": "Number of messages you get with our helpful AI assistant",
    "type": "flag",
    "settings": {
      "value": 5,
      "display_value": "5 messages per month"
    }
  }
]
```

To get everything set up in Stripe we need to bootstrap
our Stripe Products and Prices. We can do this easily with:

```shell
npx payments bootstrap development
```

And finally, to start developing with Instant Payments, in our code:

```javascript
import InstantPayments from '@instant.dev/payments';

const payments = new InstantPayments(
  process.env.STRIPE_SECRET_KEY,       // we recommend loading these via dotenv
  process.env.STRIPE_PUBLISHABLE_KEY,  // from the same file as above
  `./_instant/payments/cache/stripe_plans.json` // created from npx payments bootstrap
);

// Return this as part of an API response
let subscription = await payments.customers.subscribe({
  email,
  planName: 'basic_plan',
  successURL: `https://example.com/success/`,
  cancelURL: `https://example.com/fail/`
});
```

## Bootstrapping plans

Instant Payments automatically configures all of your Stripe **Products** and **Prices**
for you based on two files, `_instant/payments/plans.json` and `_instant/payments/line_items.json`.
These are files used to define your available subscription plans. This will then create a cache
of your plans and associated stripe data in `_instant/payments/cache/stripe_plans.json`,
which you will use to instantiate Instant Payments.

### Plans: `_instant/payments/plans.json`

Plans represent basic subscription primitives that your customers can pay for.
For example, a `Free`, `Hobby` and `Pro` tier. Your customers are charged monthly
for these plans based on the `"price"` you set. For Instant Payments,
**you must have a free plan** i.e. one plan with `"price": null`. Even if your
product is unusable in a free state, a free plan must exist to represent a user
without a subscription.

The basic structure of your `plans.json` looks something like this:

```json
[
  {
    "name": "free_plan",
    "display_name": "Free",
    "enabled": true,
    "visible": true,
    "price": null,
    "line_items_settings": {}
  },
  {
    "name": "basic_plan",
    "display_name": "Basic",
    "enabled": true,
    "visible": true,
    "price": {
      "usd": 1500
    },
    "line_items_settings": {
      "ai_assistant": {
        "value": 5000,
        "display_value": "5,000 messages per month"
      }
    }
  }
]
```

- `name` is the name of your plan for use in code, like `customers.subscribe()`
  - this will be used to uniquely identify your Stripe `Product`
- `display_name` is the intended display name for customers
- `enabled` determines whether or not users can subscribe to the plan
  - For free plans, if there are paid line items that can be added (type `capacity` or `usage`)
    then the customer will be unable to subscribe to these items if the value is `false`
  - this can be used for deprecating plans: if you don't want new users signing up on an old plan,
    you can just set `"enabled": false`
- `visible` is purely cosmetic - it is intended to be used to change the visibility of a plan
  on a page rendered by the front-end
  - this can be used if you create a custom plan you don't want users to see, or if you want people
    to be able to see legacy plans (`"enabled": false`)
- `price` is either `null` (free) or key-value pairs representing prices in specific currencies
  - values are in **cents**
  - currently only `usd` is supported, but we could add more soon!
- `line_item_settings` allows you to override default line item settings for the plan
  - for example, if a plan has a different price for a line item (like seats, projects) or
    a different amount of free items included, set it here

### Line Items: `_instant/payments/line_items.json`

Line Items represent additional Stripe `Products` your customers can pay for under the umbrella
of a plan. There are three Line Item types: `capacity`, `usage` and `flag`.

- `capacity` is for individually licensed items, like team seats
- `usage` is for items that are charged for with metered billing
- `flag` has no representation in Stripe; it's just a setting to indicate a max limit you can
  reference in your app

The basic structure of your `line_items.json` looks something like this;

```json
[
  {
    "name": "collaborator_seats",
    "display_name": "Team seats",
    "description": "The number of team members that can actively collaborate on projects for this account.",
    "type": "capacity",
    "settings": {
      "price": {
        "usd": 2000
      },
      "included_count": 1
    }
  },
  {
    "name": "execution_time",
    "display_name": "Execution time",
    "description": "The amount of time your functions run for, measured in GB of RAM multiplied by number of seconds.",
    "type": "usage",
    "settings": {
      "price": {
        "usd": 500
      },
      "units": 1000,
      "unit_name": "GB-s",
      "free_units": 100
    }
  },
  {
    "name": "ai_agent",
    "display_name": "Pearl (AI Agent)",
    "description": "Amount of included usage of Pearl, your AI assistant.",
    "type": "flag",
    "settings": {
      "value": 5,
      "display_value": "5 messages per month"
    }
  }
]
```

- `name` is the name used internally and by Stripe to reference the item, e.g. via `customers.subscribe()`
- `display_name` is the customer-readable name of the item
- `description` is a helpful customer-readable description of the item
- `type` is the line item type: one of `"capacity"`, `"usage"` or `"flag"`
- `settings` are the default line item settings and can be overridden in `plans.json` for specific plans

#### `capacity` Settings

- `price` is either `null` (free) or key-value pairs representing prices in specific currencies
  - values are in **cents**
  - currently only `usd` is supported, but we could add more soon!
- `included_count` is the number included with the plan by default (for free)
  - if you want an unlimited `included_count`, use `"price": null`

#### `usage` Settings

- `price` the **price per units**
  - it is an object of key-value pairs representing prices in specific currencies
  - values are in **cents**
  - currently only `usd` is supported, but we could add more soon!
- `units` is the number of units represented by the `price`
  - in the example above, a price of `500` for `"units": 1000` would mean $5.00 per 1,000 units
  - `price` has a minimum granularity of 1 cent, for smaller granularity increase your units
  - Instant Payments automatically handles all the math here, we recommend using human-readable
    settings here
- `unit_name` is whatever your units are called, for example `messages` or `errors` or `MB`
- `free_units` is the number of units included for free with the plan, use `0` to charge for all units

#### `flag` Settings

- `value` is the value you reference in code for the flag
- `display_value` is a customer-readable value for the flag

### Bootstrapping via `instant` CLI

```
TODO: WIP
```

### Bootstrapping via `npx payments bootstrap`

To bootstrap you plans in Stripe manually, perform the following command
where `[env]` is your environment. `development` would use your local environment.

```shell
npx payments bootstrap [env]
```

This will rely on `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in your local
`.env` file (if `[env]` is `development`), `.env.staging` (if `[env]` is `staging`),
`.env.production` (if `[env]` is `production`) ... etc.

**We recommend always running this command before deploying.** If the correct prices / products
exist it will not overwrite them, it just creates anything missing from your Stripe setup.

## API Reference

To import Instant Payments using ESM;

```javascript
import InstantPayments from '@instant.dev/payments';
```

And CommonJS:

```javascript
const InstantPayments = require('@instant.dev/payments');
```

### InstantPayments (class)

InstantPayments comes with two helper methods for manually bootstrapping and writing a
`stripe_plans.json` cache.
   
#### InstantPayments.bootstrap

```javascript
/**
 * Bootstraps Stripe with `metadata: instpay` products and prices corresponding to your line items
 * @param {string} secretKey         Your Stripe secret key
 * @param {string} plansPathname     Path to your plans.json object
 * @param {string} lineItemsPathname Path to your line_items.json object
 * @returns {object} bootstrapResult           The result of bootstrapping
 * @returns {object} bootstrapResult.cache     Your cached Stripe plans object
 * @returns {array}  bootstrapResult.Plans     Templates for your Plans from plans.json
 * @returns {array}  bootstrapResult.LineItems Templates for your Line Items from line_items.json
 */
```

```javascript
await Instant.bootstrap(secretKey, plansPathname, lineItemsPathname);
```
   
#### InstantPayments.writeCache

```javascript
/**
 * Writes a file to cache your bootstrapped plans and associated them with an environment
 * @param {string} cachePathname Desired pathname for your cached plans
 * @param {string} env           Desired environment (e.g. development, test, production)
 * @param {object} cache         JSON for your cached plans
 * @returns {boolean} success
 */
```

```javascript
Instant.writeCache(cachePathname, env, cache);
```

### InstantPayments (instance)

To create a new `InstantPayments` instance, use:

```javascript
const payments = new InstantPayments(
  process.env.STRIPE_SECRET_KEY,
  process.env.STRIPE_PUBLISHABLE_KEY,
  `./_instant/payments/cache/stripe_plans.json` // created via bootstrapping
);
```
   
#### customers

Find, subscribe and unsubscribe customers.

##### customers.find

```javascript
/**
 * Finds or creates a customer with provided email address
 * @param {string} email Customer email address
 * @returns {object} customer
 */
```

```javascript
await payments.customers.find({email: 'test@test.com'});
```
      
##### customers.subscribe

```javascript
/**
 * Subscribes to a plan by creating a Stripe checkout session
 * @param {string} email Customer email address
 * @param {string} planName The name of the plan you wish to subscribe to
 * @param {object} lineItemCounts An object containing key-value pairs mapping line item names to *purchased* quantities, if left empty line items will be adjusted automatically to match the new plan
 * @param {object} existingLineItemCounts An object containing key-value pairs mapping to existing line item counts, if provided they are used to validate if within plan limits
 * @param {string} successURL URL to redirect to if the checkout is successful
 * @param {string} cancelURL URL to redirect to if the checkout is cancelled
 * @returns {object} subscription
 */
```

```javascript
await payments.customers.subscribe({
  email: 'test@test.com',
  planName: 'pro_plan',
  lineItemCounts: {seats: 4},                    // optional
  existingLineItemCounts: {seats: 2},            // optional
  successURL: 'https://my-website.com/pay/yes/', // Recommended: MUST exist if no payment method added
  cancelURL: 'https://my-website.com/pay/no/'    // Recommended: MUST exist if no payment method added
});
```
      
##### customers.unsubscribe

```javascript
/**
 * Unsubscribes from active plan
 * @param {string} email Customer email address
 * @param {object} existingLineItemCounts An object containing key-value pairs mapping to existing line item counts, if provided they are used to validate if within plan limits
 * @returns {boolean} canceled
 */
```

```javascript
await payments.customers.unsubscribe({
  email: 'test@test.com',
  existingLineItemCounts: {seats: 2}, // optional
});
```
   
#### invoices

Lists invoices and finds the next upcoming invoice.

##### invoices.list

```javascript
/**
 * Lists all invoices for a customer
 * @param {string} email Customer email address
 * @returns {array} invoices
 */
```

```javascript
await payments.invoices.list({email: 'test@test.com'});
```
      
##### invoices.upcoming

```javascript
/**
 * Retrieves the upcoming invoice for the current user
 * @param {string} email Customer email address
 * @returns {?object} upcomingInvoice
 */
```

```javascript
await payments.invoices.upcoming({email: 'test@test.com'});
```
   
#### paymentMethods

List, create, remove, and set payment methods as default.
      
##### paymentMethods.list

```javascript
/**
 * Lists all available payment methods for a customer
 * @param {string} email Customer email address
 * @returns {array} paymentMethods
 */
```

```javascript
await payments.paymentMethods.list({email: 'test@test.com'});
```
      
##### paymentMethods.create

```javascript
/**
 * Creates a payment method using Stripe checkout
 * @param {string} email Customer email address
 * @param {string} successURL URL to redirect to if the payment method addition is successful
 * @param {string} cancelURL URL to redirect to if the payment method addition is cancelled
 * @returns {object} checkoutSession
 * @returns {string} checkoutSession.stripe_publishable_key         Key to use for creating Stripe checkout sessions
 * @returns {string} checkoutSession.stripe_checkout_session_id Checkout session id for use with Stripe's frontend library
 */
```

```javascript
await payments.paymentMethods.create({
  email: 'test@test.com',
  successURL: 'https://my-website.com/pay/card_added',
  cancelURL: 'https://my-website.com/pay/card_failed'
});
```
      
##### paymentMethods.remove

```javascript
/**
 * Removes a payment method and sets a new default payment method if none set
 * @param {string} email Customer email address
 * @param {string} paymentMethodId The Stripe ID of the payment method to remove
 * @returns {array} paymentMethods List of all existing payment methods
 */
```

```javascript
await payments.paymentMethods.remove({
  email: 'test@test.com',
  paymentMethodId: 'card_xxx' // Stripe paymentMethod ID
})
```
      
##### paymentMethods.setDefault

```javascript
/**
 * Changes a payment method to the default payment method for the customer
 * @param {string} email Customer email address
 * @param {string} paymentMethodId The Stripe ID of the payment method to remove
 * @returns {object} paymentMethod Payment method object created
 */
```

```javascript
await payments.paymentMethods.setDefault({
  email: 'test@test.com',
  paymentMethodId: 'card_xxx' // Stripe paymentMethod ID
})
```
   
#### plans

Lists all available plans, gets current plan for a customer, or finds
the billing status (faster than getting the entire current plan).
      
##### plans.list

```javascript
/**
 * Lists all available plans
 * @returns {array} plans Available plans
 */
```

```javascript
await payments.plans.list();
```
      
##### plans.current

```javascript
/**
 * Retrieves the plan a customer is currently subscribed to
 * @param {string} email Customer email address
 * @returns {object} planResult             Plan customer is currently subscribed to
 * @returns {object} planResult.currentPlan Current Subscription plan
 * @returns {array}  planResult.plans       All available plans
 */
```

```javascript
await payments.plans.current({email: 'test@test.com'});
```
      
##### plans.billingStatus

```javascript
/**
 * Retrieves the billing status of the current customer plan
 * @param {string} email Customer email address
 * @returns {object}  planResult                           Plan customer is currently subscribed to
 * @returns {object}  planResult.currentPlan               Current Subscription plan billable summary
 * @returns {boolean} planResult.currentPlan.is_billable   is the plan billable?
 * @returns {boolean} planResult.currentPlan.is_incomplete is the subscription complete?
 * @returns {boolean} planResult.currentPlan.is_past_due   is the subscription past due?
 * @returns {string}  planResult.currentPlan.invoice_url   URL of the invoice, if incomplete or past due
 */
```

```javascript
await payments.plans.billingStatus({email: 'test@test.com'});
```
   
#### usageRecords

Creates new usage records for `"type": "usage"` line items. These will be billed
**at the end** of each billing cycle.
      
##### usageRecords.create

**NOTE:** By default, this method can only be called per-customer once every 10 minutes.
We recommend aggregating usage calls and sending them in a cron job.

```javascript
/**
 * Creates a usage record for the customer
 * @param {string} email Customer email address
 * @param {string} lineItemName The name of the Line Item to record usage for
 * @param {integer{0,2147483647}} quantity The quantity to record
 * @param {integer{-12,0}} log10Scale Scale factor in which to adjust quantity x 10^n
 * @param {integer{-10,0}} log2Scale Scale factor in which to adjust quantity x 2^n
 * @returns {object} usageRecord
 */
```

To avoid floating-point arithmetic errors, we provide a `log10Scale` and
`log2Scale` adjustment parameters. You should **always** pass an integer to
`quantity`. If you need to use 0.1, send `quantity: 1` and `log10Scale: -1`.
We have included `log2Scale` up to `-10`, e.g. 1/1024 for fractions that are
multiples of 1/2 and byte-related multiples (2^-10 = 1024).

```javascript
await payments.usageRecords.create({
  email: 'test@test.com',
  lineItemName: 'execution_time',
  quantity: 100,
  log10Scale: -3 // 1/1,000th of the quantity provided
  log2Scale: -10 // 1/1,024th of the quantity provided
})
```

## Deploying to different environments

Instant Payments relies on `.env` files for bootstrapping Stripe in different environments.
When deploying, tou need to make sure that `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`
are set in any environment you deploy to. 

### Deploying via `instant` CLI

```
TODO: WIP
```

### Deploying manually

We offer no specific guidance on manual deploys, but **remember to bootstrap** every time you
deploy to ensure your deployment environment is in sync with Stripe.

# Acknowledgements

Special thank you to [Scott Gamble](https://x.com/threesided) who helps run all of the front-of-house work for instant.dev 💜!

| Destination | Link |
| ----------- | ---- |
| Home | [instant.dev](https://instant.dev) |
| GitHub | [github.com/instant-dev](https://github.com/instant-dev) |
| Discord | [discord.gg/puVYgA7ZMh](https://discord.gg/puVYgA7ZMh) |
| X / instant.dev | [x.com/instantdevs](https://x.com/instantdevs) |
| X / Keith Horwood | [x.com/keithwhor](https://x.com/keithwhor) |
| X / Scott Gamble | [x.com/threesided](https://x.com/threesided) |