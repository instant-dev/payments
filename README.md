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
  `./_instant/payments/cached/stripe_plans.json` // more on this cached file below
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
- Charging in USD only is sufficient (WIP: May support other currencies)

If you can work within these limitations, webhooks can be avoided completely by using
Stripe's hosted checkout for both subscriptions and managing payment methods. You do not
need database synchronization as you can load plan details directly from Stripe using the
user's email. This is slower than a database call but typically can be executed in about 500ms.

## Table of Contents

1. [Getting Started](#getting-started)
   1. [Quickstart via `instant` CLI](#quickstart-via-instant-cli)
   1. [Manual Installation](#manual-installation)
1. [Bootstrapping plans](#bootstrapping-plans)
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

WIP (Instant CLI)

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
  `./_instant/payments/cached/stripe_plans.json` // created from npx payments bootstrap
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

WIP

### Bootstrapping via `instant` CLI

WIP

### Bootstrapping via `npx payments bootstrap`

WIP

## API Reference

WIP

### InstantPayments (class)

WIP
   
#### InstantPayments.bootstrap

WIP
   
#### InstantPayments.writeCache

WIP

### InstantPayments (instance)

WIP
   
#### customers

WIP
      
##### customers.find

WIP
      
##### customers.subscribe

WIP
      
##### customers.unsubscribe

WIP
   
#### invoices

WIP
      
##### invoices.list

WIP
      
##### invoices.upcoming

WIP
   
#### paymentMethods

WIP
      
##### paymentMethods.list

WIP
      
##### paymentMethods.create

WIP
      
##### paymentMethods.remove

WIP
      
##### paymentMethods.setDefault

WIP
   
#### plans

WIP
      
##### plans.list

WIP
      
##### plans.current

WIP
      
##### plans.billingStatus

WIP
   
#### usageRecords

WIP
      
##### usageRecords.create

WIP

## Deploying to different environments

WIP

### Deploying via `instant` CLI

WIP

### Deploying manually

WIP

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