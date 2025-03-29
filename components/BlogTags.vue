<script setup lang="ts">
const { tags } = defineProps<{
    tags: Array<String>
}>()
</script>

<template>
    <div class="mt-4 flex flex-wrap gap-2">
        <BlogTag v-for="tag in tags" :tag="tag" />
    </div>
</template>
