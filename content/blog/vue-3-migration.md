---
date: 2025-09-21
tags: [vue, vue router, vue compat, vue 3, migration]
---

# Vue 3 Migration Pain Points

99% of the time, migrating to a new framework will be painful. Upgrading from Vue 2 to Vue 3 is no exception. My company recently upgraded their Vue monorepo of about 30 modules to Vue 3. I wanted to share some of the lessons I've learned along the way.

Before I do, I wanted to give kudos to the Vue team for creating [Vue Compat and creating an extensive migration guide](https://v3-migration.vuejs.org/). Without this, it would've been **_a lot_** more difficult to upgrade. I highly recommend reading this guide carefully.

## A New Reactivity Model

One of the biggest changes is that Vue 2 changes uses a reactivity model involving Object.defineProperty. Now, Vue 3 uses [Proxies](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) as wrappers and utilizes get/set overrides to easily track reactivity updates.

One of the big advantages to Proxies is when you need to track new properties. In Vue 2, you would typically need to write some code to get your reactive object to track a new property. That would look something like this.

```js
    Vue.set(yourReactiveObject, 'newProperty', value)
```

But in Vue 3, new properties are automatically track in the set override. And that's great! But unfortunately, the change from reactive objects to Proxies also broke a lot of our code. We relied on the fact that reactive objects were serializable and typically sent them via [postMessages](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) to iframes that were listening for these messages. But, alas, Proxies are not serializable.

Typically, you can use [toRaw](https://vuejs.org/api/reactivity-advanced#toraw) to grab the original object. We created a utility method since `toRaw` doesn't unwrap nested objects.

```js
const objectIterator = (input: unknown): unknown => {
  if (isRef(input) || isReactive(input) || isProxy(input)) {
    return objectIterator(toRaw(input))
  }

  if (Array.isArray(input)) {
    return input.map((item) => objectIterator(item))
  }

  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input)
        .map(([key, value]) => [key, objectIterator(value)]),
    )
  }

  return input
}

export const toRawDeep = (sourceObj: Record<string, unknown>): Record<string, unknown> => {
  const returnObject = objectIterator(sourceObj)

  if (!isRecord(returnObject)) {
    throw new TypeError('There was a problem unwrapping your reactive object/ref')
  }

  return returnObject
}
```

## No More Arbitrary Route Params

This is actually not a Vue 3 pain point, but rather a Vue Router (version 4) pain point. In our app, we would sometimes use router params as a way to temporarily store data in-between routes. However, this was determined by the Vue Router team to be an anti-pattern since [reloading the page causes you to lose params](https://github.com/vuejs/router/blob/main/packages/router/CHANGELOG.md#414-2022-08-22).

Since the data is temporary, we wouldn't too keen on adding it to our global stores. Instead, we decided to utilize the History API. Similar to Proxies and `toRaw`, this also has issues with serialization since Javascript objects !== JSON. But, for what we're using it for, this has worked well for us.

## Vue Compat Not Adding Event Listeners to Child Components

Just to reiterate what I said before, Vue Compat has been a fantastic tool in our Vue 3 migration. However, it is a complex package that essentially tries to make Vue 2 code compatible with Vue 3 code, so we expected some errors to occur. One of the most enigmatic issues we saw is when we noticed that events weren't being added to child components. For example, here is an onClick event listener that wasn't be added to the HelloWorld component.

```js
<template>
  <div>
    <img alt="Vue logo" src="./assets/logo.png" />
    <HelloWorld @click="onClick" />
  </div>
</template>
```

The key change here is that in Vue 2, you could access attributes via `this.$attrs` and event listeners via `this.$listeners`. But in Vue 3, these are both accessible via `this.$attrs`. [LinusBorg gives a great summary on what the issue is and how to fix it.](https://github.com/vuejs/core/issues/4566#issuecomment-917997056)

Hopefully this post has been a little bit helpful! 😊 The Vue 3 migration is painful but it's well worth it to continue receiving all the new updates and securities. As a reminder:

 * Vue 2 went on EOL on December 31st, 2023.
 * There is a [known CVE in Vue 2](https://www.cve.org/CVERecord?id=CVE-2024-6783).
