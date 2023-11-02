# Instant Payments

![travis-ci build](https://travis-ci.org/instant-dev/payments.svg?branch=main)
![npm version](https://img.shields.io/npm/v/@instant.dev/payments?label=)

## Use Stripe as a System of Record

Instant Payments is a Stripe wrapper that allows you to build a fully-functional
Stripe integration without needing to use either a database or webhooks. We built
Instant Payments because price discovery in SaaS is difficult: pricing and plans
often take multiple iterations to get right. Having to redo your billing system
every time you get a new piece of information about price points wastes time you
could be spending on your product.

Instant Payments provides a simple abstraction on top of Stripe that simplifies
everything to just two `.json` files representing **Plans** and **LineItems**,
which provide simplified abstractions over stripe's own `Products`, `Prices`,
`Subscriptions` and `SubscriptionItems`. Instant Payments takes these files and
automatically configures Products and Prices in Stripe for you. It then provides
an easy-to-use `subscribe()` and `unsubscribe()` method:

```javascript
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

1. Getting Started
1. Acknowledgements

## Getting Started

`Work in progress ...`

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