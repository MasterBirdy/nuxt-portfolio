<script setup lang="ts">
import type { BlogCollectionItem } from '@nuxt/content'
import { NuxtLink } from '#components'
import { computed } from 'vue'
const { post } = defineProps<{
    post: BlogCollectionItem
}>()

const formattedDate = computed(() => {
    const newDate = new Date(post.date)
    const month = String(newDate.getUTCMonth() + 1).padStart(2, '0')
    const day = String(newDate.getUTCDate()).padStart(2, '0')
    const year = newDate.getUTCFullYear()
    return `${month}/${day}/${year}`
})
</script>

<template>
    <div
        class="block rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
    >
        <NuxtLink :to="post.stem">
            <h3
                class="text-lg font-medium text-gray-900 hover:text-gray-700 transition duration-300 ease-in-out"
            >
                {{ post.title }}
            </h3>
        </NuxtLink>
        <p class="mt-3 text-sm italic text-gray-600">{{ formattedDate }}</p>
        <BlogTags :tags="post.tags" />
    </div>
</template>
